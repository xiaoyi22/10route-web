import os from 'node:os';
import { readFile, statfs, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
const readText = path => readFile(path, 'utf8').catch(() => null);

export function parseMemory(text = '') {
  const counters = Object.fromEntries([...String(text).matchAll(/^([A-Za-z_]+):\s+(\d+) kB$/gm)].map(match => [match[1], Number(match[2]) * 1024]));
  const usage = (totalBytes, availableBytes) => {
    const known = Number.isFinite(totalBytes) && Number.isFinite(availableBytes) && availableBytes <= totalBytes;
    const usedBytes = known ? totalBytes - availableBytes : null;
    return { totalBytes: totalBytes ?? null, availableBytes: availableBytes ?? null, usedBytes, usagePercent: known && totalBytes > 0 ? usedBytes / totalBytes * 100 : null };
  };
  return { memory: usage(counters.MemTotal, counters.MemAvailable), swap: usage(counters.SwapTotal, counters.SwapFree) };
}

export function cpuUsage(before, after) {
  if (!before.length || before.length !== after.length) return null;
  const sum = (cpus, key) => cpus.reduce((total, cpu) => total + (key ? cpu.times.idle || 0 : Object.values(cpu.times).reduce((value, time) => value + time, 0)), 0);
  const total = sum(after) - sum(before);
  const idle = sum(after, 'idle') - sum(before, 'idle');
  return total > 0 && idle >= 0 && idle <= total ? (total - idle) / total * 100 : null;
}

async function serviceInfo() {
  try {
    const result = await execute('systemctl', ['--user', 'show', '10router.service', '-p', 'MainPID', '-p', 'ActiveState'], { timeout: 1500, maxBuffer: 4096 });
    const values = Object.fromEntries(result.stdout.trim().split('\n').map(line => line.split('=')));
    const pid = Number(values.MainPID) || null;
    const status = pid ? await readText('/proc/' + pid + '/status') : null;
    const rss = status?.match(/^VmRSS:\s+(\d+) kB$/m);
    return { service: '10router.service', state: values.ActiveState || 'unknown', pid, rssBytes: rss ? Number(rss[1]) * 1024 : null };
  } catch { return null; }
}

export async function collectSystemInfo() {
  if (os.platform() !== 'linux') throw new Error('Linux system collection only');
  const started = Date.now();
  const before = os.cpus();
  const [release, memoryText, disk, service, cgroup, containerFile] = await Promise.all([
    readText('/etc/os-release'), readText('/proc/meminfo'), statfs('/').catch(() => null), serviceInfo(), readText('/proc/1/cgroup'), access('/.dockerenv').then(() => true).catch(() => false), delay(300),
  ]);
  const after = os.cpus();
  const container = containerFile || !!process.env.container || /docker|kubepods|lxc|containerd/.test(cgroup || '');
  const totalBytes = disk ? disk.blocks * disk.bsize : null;
  const usedBytes = disk ? (disk.blocks - disk.bfree) * disk.bsize : null;
  return {
    sampledAt: new Date().toISOString(), hostname: os.hostname(), platform: 'linux', architecture: os.arch(),
    operatingSystem: release?.match(/^PRETTY_NAME="?([^"\n]+)"?$/m)?.[1] || 'Linux', kernel: os.release(),
    scope: container ? 'container' : 'system', uptimeSeconds: os.uptime(),
    cpu: { model: after[0]?.model || null, logicalCores: after.length, usagePercent: cpuUsage(before, after), sampleMilliseconds: Date.now() - started, loadAverage: os.loadavg() },
    ...parseMemory(memoryText),
    disk: { mount: '/', totalBytes, usedBytes, availableBytes: disk ? disk.bavail * disk.bsize : null, usagePercent: totalBytes > 0 ? usedBytes / totalBytes * 100 : null },
    gatewayProcess: service,
  };
}
