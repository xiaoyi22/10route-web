import os from 'node:os';
import { readFile, readdir, readlink, statfs, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
const readDirectory = readdir;
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
    const result = await execute('systemctl', ['--user', 'show', '10router.service', '-p', 'MainPID', '-p', 'ActiveState', '-p', 'NRestarts', '-p', 'MemoryCurrent', '-p', 'TasksCurrent', '-p', 'ActiveEnterTimestamp', '--timestamp=unix'], { timeout: 1500, maxBuffer: 4096 });
    const values = Object.fromEntries(result.stdout.trim().split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]).filter(pair => pair[0]));
    const pid = Number(values.MainPID) || null;
    const status = pid ? await readText('/proc/' + pid + '/status') : null;
    const rss = status?.match(/^VmRSS:\s+(\d+) kB$/m);
    const handles = pid ? await readDirectory('/proc/' + pid + '/fd').then(entries => entries.length).catch(() => null) : null;
    const entered = Number(values.ActiveEnterTimestamp?.replace(/^@/, '')) * 1000;
    return {
      service: '10router.service', state: values.ActiveState || 'unknown', pid, rssBytes: rss ? Number(rss[1]) * 1024 : null,
      restarts: Number.isFinite(Number(values.NRestarts)) ? Number(values.NRestarts) : null,
      memoryBytes: Number(values.MemoryCurrent) > 0 ? Number(values.MemoryCurrent) : null,
      tasks: Number(values.TasksCurrent) > 0 ? Number(values.TasksCurrent) : null,
      openFiles: handles, startedAt: Number.isFinite(entered) ? new Date(entered).toISOString() : null,
    };
  } catch { return null; }
}

async function socketStats(pid) {
  if (!pid) return null;
  try {
    const handles = await readDirectory('/proc/' + pid + '/fd');
    const inodes = new Set();
    for (const handle of handles) {
      const target = await readlink('/proc/' + pid + '/fd/' + handle).catch(() => '');
      const inode = target.match(/^socket:\[(\d+)\]$/)?.[1];
      if (inode) inodes.add(inode);
    }
    if (!inodes.size) return null;
    const tables = await Promise.all(['/proc/net/tcp', '/proc/net/tcp6'].map(path => readText(path)));
    let established = 0;
    let listening = 0;
    for (const table of tables) {
      for (const line of (table || '').split('\n').slice(1)) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 10 || !inodes.has(fields[9])) continue;
        if (fields[3] === '01') established++;
        else if (fields[3] === '0A') listening++;
      }
    }
    return { total: inodes.size, established, listening };
  } catch { return null; }
}

async function failedUnits() {
  const read = async scope => {
    try {
      const result = await execute('systemctl', [...(scope === 'user' ? ['--user'] : []), 'list-units', '--failed', '--no-legend', '--plain'], { timeout: 1500, maxBuffer: 8192 });
      return result.stdout.split('\n').map(line => line.trim().split(/\s+/)[0]).filter(name => /^[\w@.-]+\.(service|mount|socket|timer|path)$/.test(name)).map(name => ({ scope, name }));
    } catch { return []; }
  };
  const units = [...await read('user'), ...await read('system')];
  return units.length ? units : null;
}

export function parsePressure(text = '') {
  const fields = Object.fromEntries(String(text).matchAll(/(some|full) avg10=([\d.]+)/g).map(match => [match[1], Number(match[2])]));
  return { some: Number.isFinite(fields.some) ? fields.some : null, full: Number.isFinite(fields.full) ? fields.full : null };
}

export function parseMemDetail(text = '') {
  const counters = Object.fromEntries([...String(text).matchAll(/^([A-Za-z_]+):\s+(\d+) kB$/gm)].map(match => [match[1], Number(match[2]) * 1024]));
  const pick = name => Number.isFinite(counters[name]) ? counters[name] : null;
  return { buffersBytes: pick('Buffers'), cachedBytes: pick('Cached'), slabBytes: pick('Slab'), dirtyBytes: pick('Dirty'), anonymousBytes: pick('AnonPages'), swapCachedBytes: pick('SwapCached') };
}

export function parseNetwork(text = '') {
  return [...String(text).matchAll(/^\s*(\S+?):\s*((?:\d+\s+){15}\d+)\s*$/gm)]
    .filter(match => !['lo', 'docker0'].includes(match[1]) && !match[1].startsWith('br-') && !match[1].startsWith('veth'))
    .map(match => { const fields = match[2].trim().split(/\s+/).map(Number); return { name: match[1], receivedBytes: fields[0], transmittedBytes: fields[8] }; });
}

export function parseDiskIo(text = '', devices = []) {
  const counters = Object.fromEntries(String(text).trim().split('\n').map(line => line.trim().split(/\s+/)).filter(fields => devices.includes(fields[2])).map(fields => [fields[2], { readBytes: Number(fields[5]) * 512, writtenBytes: Number(fields[9]) * 512, busyMilliseconds: Number(fields[12]) }]));
  return devices.map(device => counters[device] ? { name: device, ...counters[device] } : null).filter(Boolean);
}

export function attachRates(sample, previous) {
  const at = Date.parse(sample.sampledAt);
  const before = previous ? Date.parse(previous.sampledAt) : NaN;
  const elapsed = Number.isFinite(at) && Number.isFinite(before) && at > before ? at - before : 0;
  const networkRates = elapsed ? rateBetween(previous.network || [], sample.network || [], elapsed) : null;
  const diskRates = elapsed ? rateBetween(previous.diskActivity?.devices || [], sample.diskActivity?.devices || [], elapsed) : null;
  return {
    ...sample,
    network: (sample.network || []).map(link => ({ name: link.name, rate: networkRates?.find(rate => rate.name === link.name) || null })),
    diskActivity: { sampledMilliseconds: elapsed || null, rates: diskRates, busyPercent: diskRates ? Math.min(100, Math.max(...diskRates.map(device => device.busyMilliseconds)) / 10) : null },
  };
}

export function rateBetween(previous, current, elapsedMilliseconds) {
  if (!Array.isArray(previous) || !Array.isArray(current) || !(elapsedMilliseconds > 0)) return null;
  const before = new Map(previous.map(item => [item.name, item]));
  const rates = current.map(item => {
    const last = before.get(item.name);
    const keys = Object.keys(item).filter(key => key !== 'name');
    if (!last || keys.some(key => !Number.isFinite(item[key]) || !Number.isFinite(last[key]))) return null;
    const rate = { name: item.name };
    for (const key of keys) rate[key] = Math.max(0, (item[key] - last[key]) / elapsedMilliseconds * 1000);
    return rate;
  }).filter(Boolean);
  return rates.length ? rates : null;
}

async function fileSystems() {
  try {
    const text = await readText('/proc/self/mounts');
    const filesystems = [];
    for (const line of text.split('\n')) {
      const [device, mount, type] = line.split(/\s+/);
      if (!/^\/dev\/(sd|nvme|vd|hd|mapper)/.test(device || '') || !['ext4', 'xfs', 'btrfs', 'vfat'].includes(type) || filesystems.some(entry => entry.mount === mount)) continue;
      const stats = await statfs(mount).catch(() => null);
      if (!stats) continue;
      const totalBytes = stats.blocks * stats.bsize;
      const usedBytes = (stats.blocks - stats.bfree) * stats.bsize;
      filesystems.push({ mount, totalBytes, usedBytes, availableBytes: stats.bavail * stats.bsize, usagePercent: totalBytes > 0 ? usedBytes / totalBytes * 100 : null });
    }
    return filesystems.length ? filesystems : null;
  } catch { return null; }
}

async function identity() {
  const [vendor, product, version, bios] = await Promise.all([
    readText('/sys/class/dmi/id/sys_vendor'), readText('/sys/class/dmi/id/product_name'), readText('/sys/class/dmi/id/product_version'), readText('/sys/class/dmi/id/bios_vendor'),
  ]);
  const hardware = [vendor, product, version].map(value => value?.trim()).filter(Boolean).join(' ');
  if (!hardware || /^to be filled/i.test(hardware)) return { hardware: null, virtualMachine: null };
  const host = [hardware, bios?.trim()].filter(Boolean).join(' ');
  const marker = /QEMU|KVM|VirtualBox|VMware|Bochs|Hyper-V|Amazon EC2|Google Compute|Xen/i.test(host);
  return { hardware, virtualMachine: marker ? true : null };
}

async function bootTime() {
  const text = await readText('/proc/stat');
  const seconds = Number(text?.match(/^btime (\d+)$/m)?.[1]);
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

export async function collectSystemInfo() {
  if (os.platform() !== 'linux') throw new Error('Linux system collection only');
  const started = Date.now();
  const before = os.cpus();
  const [release, memoryText, disk, service, cgroup, containerFile, ioPressure, cpuPressure, memoryPressure, networkText, diskStatText, failed, mounts, machine, bootedAt, blockNames] = await Promise.all([
    readText('/etc/os-release'), readText('/proc/meminfo'), statfs('/').catch(() => null), serviceInfo(), readText('/proc/1/cgroup'), access('/.dockerenv').then(() => true).catch(() => false), readText('/proc/pressure/io'), readText('/proc/pressure/cpu'), readText('/proc/pressure/memory'), readText('/proc/net/dev'), readText('/proc/diskstats'), failedUnits(), fileSystems(), identity(), bootTime(), readDirectory('/sys/class/block').catch(() => []), delay(300),
  ]);
  const sockets = await socketStats(service?.pid);
  const after = os.cpus();
  const container = containerFile || !!process.env.container || /docker|kubepods|lxc|containerd/.test(cgroup || '');
  const totalBytes = disk ? disk.blocks * disk.bsize : null;
  const usedBytes = disk ? (disk.blocks - disk.bfree) * disk.bsize : null;
  const devices = (blockNames.filter(name => /^(sd[a-z]+|nvme\d+n\d+|vd[a-z]+|hd[a-z]+)$/.test(name))).sort();
  const network = parseNetwork(networkText);
  const io = parseDiskIo(diskStatText, devices);
  return {
    sampledAt: new Date().toISOString(), hostname: os.hostname(), platform: 'linux', architecture: os.arch(),
    operatingSystem: release?.match(/^PRETTY_NAME="?([^"\n]+)"?$/m)?.[1] || 'Linux', kernel: os.release(),
    scope: container ? 'container' : 'system', uptimeSeconds: os.uptime(), bootedAt: await bootedAt,
    ...machine,
    cpu: { model: after[0]?.model || null, logicalCores: after.length, usagePercent: cpuUsage(before, after), sampleMilliseconds: Date.now() - started, loadAverage: os.loadavg() },
    ...parseMemory(memoryText),
    memoryDetail: parseMemDetail(memoryText),
    disk: { mount: '/', totalBytes, usedBytes, availableBytes: disk ? disk.bavail * disk.bsize : null, usagePercent: totalBytes > 0 ? usedBytes / totalBytes * 100 : null },
    diskActivity: { devices: io },
    filesystems: mounts,
    pressure: { cpu: parsePressure(cpuPressure), io: parsePressure(ioPressure), memory: parsePressure(memoryPressure) },
    network,
    failedUnits: failed,
    gatewayProcess: { ...service, sockets },
  };
}
