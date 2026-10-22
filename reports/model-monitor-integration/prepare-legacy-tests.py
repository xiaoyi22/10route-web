from pathlib import Path
root = Path('/tmp/10router-monitor-integration/tests/unit')
names = ['mimo-desktop-connection-test.test.js', 'qoder-test-model-select.test.js', 'grok-cli-oauth-probe.test.js', 'codebuddy-intl-test-support.test.js', 'codex-cli-version.test.js', 'mimo-plan-routing.test.js', 'stepfun-connection-test.test.js', 'connection-test-health-cleanup.test.js', 'connection-test-validation-url.test.js', 'antigravity-tos-quarantine.test.js', 'model-test-routing.test.js']
for name in names:
    path = root / name
    text = path.read_text()
    text = 'vi.mock("@/lib/iqMonitor/testingPolicy", () => ({ assertTestingAllowed: vi.fn(async () => {}) }));\n' + text
    path.write_text(text)
print('Updated permission fixtures:', len(names))
