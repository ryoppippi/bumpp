import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { x } from 'tinyexec'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { versionBump } from '../src'

// `gitCommit` shells out to `git` using the current process cwd (not
// `operation.options.cwd`), so the test has to actually `chdir` into the
// temp repo rather than just passing `cwd` to `versionBump`.
let dir: string
let originalCwd: string

beforeEach(async () => {
  originalCwd = process.cwd()
  dir = await mkdtemp(join(tmpdir(), 'bumpp-execute-all-'))
  process.chdir(dir)
  await x('git', ['init', '-q'])
  await x('git', ['config', 'user.email', 'test@example.com'])
  await x('git', ['config', 'user.name', 'Test'])
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2))
  await x('git', ['add', 'package.json'])
  await x('git', ['commit', '-qm', 'init'])
})

afterEach(async () => {
  process.chdir(originalCwd)
  await rm(dir, { recursive: true, force: true })
})

it('includes new files created by --execute in the release commit when `all` is set', async () => {
  await versionBump({
    release: 'patch',
    confirm: false,
    push: false,
    commit: true,
    all: true,
    execute: `node -e "require('fs').writeFileSync('GENERATED.md', 'hello')"`,
  })

  const { stdout } = await x('git', ['show', '--stat', '--format=', 'HEAD'])
  expect(stdout).toContain('GENERATED.md')

  const content = await readFile(join(dir, 'GENERATED.md'), 'utf8')
  expect(content).toBe('hello')

  const status = await x('git', ['status', '--porcelain'])
  expect(status.stdout.trim()).toBe('')
})
