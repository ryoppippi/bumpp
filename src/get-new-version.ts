import type { BumpRelease, PromptRelease } from './normalize-options'
import type { Operation } from './operation'
import type { ReleaseType } from './release-type'
import process from 'node:process'
import * as ezSpawn from '@jsdevtools/ez-spawn'
import c from 'picocolors'
import prompts from 'prompts'
import semver, { clean as cleanVersion, valid as isValidVersion, SemVer } from 'semver'
import { isPrerelease, releaseTypes } from './release-type'

/**
 * Determines the new version number, possibly by prompting the user for it.
 */
export async function getNewVersion(operation: Operation): Promise<Operation> {
  const { release } = operation.options
  const { currentVersion } = operation.state

  switch (release.type) {
    case 'prompt':
      return promptForNewVersion(operation)

    case 'version':
      return operation.update({
        newVersion: new SemVer(release.version, true).version,
      })

    default:
      return operation.update({
        release: release.type,
        newVersion: getNextVersion(currentVersion, release),
      })
  }
}

/**
 * Returns the next version number of the specified type.
 */
function getNextVersion(currentVersion: string, bump: BumpRelease): string {
  const oldSemVer = new SemVer(currentVersion)

  const type = bump.type === 'next'
    ? oldSemVer.prerelease.length ? 'prerelease' : 'patch'
    : bump.type

  const newSemVer = oldSemVer.inc(type, bump.preid)

  if (
    isPrerelease(bump.type)
    && newSemVer.prerelease.length === 2
    && newSemVer.prerelease[0] === bump.preid
    && String(newSemVer.prerelease[1]) === '0'
  ) {
    // This is a special case when going from a non-prerelease version to a prerelease version.
    // SemVer sets the prerelease version to zero (e.g. "1.23.456" => "1.23.456-beta.0").
    // But the user probably expected it to be "1.23.456-beta.1" instead.
    // @ts-expect-error - TypeScript thinks this array is read-only
    newSemVer.prerelease[1] = '1'
    newSemVer.format()
  }

  return newSemVer.version
}

/**
 * Returns the next version number for all release types.
 */
function getNextVersions(currentVersion: string, preid: string): Record<ReleaseType, string> {
  const next: Record<string, string> = {}

  const parse = semver.parse(currentVersion)
  if (typeof parse?.prerelease[0] === 'string')
    preid = parse?.prerelease[0] || 'preid'

  for (const type of releaseTypes)
    next[type] = getNextVersion(currentVersion, { type, preid })

  return next
}

/**
 * Prompts the user for the new version number.
 *
 * @returns - A tuple containing the new version number and the release type (if any)
 */
async function promptForNewVersion(operation: Operation): Promise<Operation> {
  const { currentVersion } = operation.state
  const release = operation.options.release as PromptRelease

  const next = getNextVersions(currentVersion, release.preid)
  const configCustomVersion = await operation.options.customVersion?.(currentVersion, semver)

  if (operation.options.printCommits) {
    await printRecentCommits(operation)
  }

  const PADDING = 13
  const answers = await prompts([
    {
      type: 'autocomplete',
      name: 'release',
      message: `Current version ${c.green(currentVersion)}`,
      initial: configCustomVersion ? 'config' : 'next',
      choices: [
        { value: 'major', title: `${'major'.padStart(PADDING, ' ')} ${c.bold(next.major)}` },
        { value: 'minor', title: `${'minor'.padStart(PADDING, ' ')} ${c.bold(next.minor)}` },
        { value: 'patch', title: `${'patch'.padStart(PADDING, ' ')} ${c.bold(next.patch)}` },
        { value: 'next', title: `${'next'.padStart(PADDING, ' ')} ${c.bold(next.next)}` },
        ...configCustomVersion
          ? [
              { value: 'config', title: `${'from config'.padStart(PADDING, ' ')} ${c.bold(configCustomVersion)}` },
            ]
          : [],
        { value: 'prepatch', title: `${'pre-patch'.padStart(PADDING, ' ')} ${c.bold(next.prepatch)}` },
        { value: 'preminor', title: `${'pre-minor'.padStart(PADDING, ' ')} ${c.bold(next.preminor)}` },
        { value: 'premajor', title: `${'pre-major'.padStart(PADDING, ' ')} ${c.bold(next.premajor)}` },
        { value: 'none', title: `${'as-is'.padStart(PADDING, ' ')} ${c.bold(currentVersion)}` },
        { value: 'custom', title: 'custom ...'.padStart(PADDING + 4, ' ') },
      ],
    },
    {
      type: prev => prev === 'custom' ? 'text' : null,
      name: 'custom',
      message: 'Enter the new version number:',
      initial: currentVersion,
      validate: (custom: string) => {
        return isValidVersion(custom) ? true : 'That\'s not a valid version number'
      },
    },
  ]) as {
    release: ReleaseType | 'none' | 'custom' | 'config'
    custom?: string
  }

  const newVersion = answers.release === 'none'
    ? currentVersion
    : answers.release === 'custom'
      ? cleanVersion(answers.custom!)!
      : answers.release === 'config'
        ? cleanVersion(configCustomVersion!)
        : next[answers.release]

  if (!newVersion)
    process.exit(1)

  switch (answers.release) {
    case 'custom':
    case 'config':
    case 'next':
    case 'none':
      return operation.update({ newVersion })

    default:
      return operation.update({ release: answers.release, newVersion })
  }
}

const messageColorMap: Record<string, (c: string) => string> = {
  chore: c.gray,
  fix: c.yellow,
  feat: c.green,
  refactor: c.cyan,
  docs: c.blue,
  doc: c.blue,
  ci: c.gray,
  build: c.gray,
}

export async function printRecentCommits(operation: Operation): Promise<void> {
  let sha: string | undefined
  sha ||= await ezSpawn
    .async(
      'git',
      ['rev-list', '-n', '1', `v${operation.state.currentVersion}`],
      { stdio: 'pipe' },
    )
    .then(res => res.stdout.trim())
    .catch(() => undefined)
  sha ||= await ezSpawn
    .async(
      'git',
      ['rev-list', '-n', '1', operation.state.currentVersion],
      { stdio: 'pipe' },
    )
    .then(res => res.stdout.trim())
    .catch(() => undefined)

  if (!sha) {
    console.log(
      c.blue(`i`)
      + c.gray(` Failed to locate the previous tag ${c.yellow(`v${operation.state.currentVersion}`)}`),
    )
    return
  }

  const message = await ezSpawn.async(
    'git',
    [
      '--no-pager',
      'log',
      `${sha}..HEAD`,
      '--oneline',
    ],
    { stdio: 'pipe' },
  )

  const lines = message
    .stdout
    .toString()
    .trim()
    .split(/\n/g)

  if (!lines.length) {
    console.log()
    console.log(c.blue(`i`) + c.gray(` No commits since ${operation.state.currentVersion}`))
    console.log()
    return
  }

  interface ParsedCommit {
    hash: string
    tag: string
    message: string
    color: (c: string) => string
  }

  const parsed = lines.map((line): ParsedCommit => {
    const [hash, ...parts] = line.split(' ')
    const message = parts.join(' ')
    const match = message.match(/^(\w+)(\([^)]+\))?(!)?:(.*)$/)
    if (match) {
      let color = messageColorMap[match[1].toLowerCase()] || ((c: string) => c)
      if (match[3] === '!') {
        color = c.red
      }
      const tag = [match[1], match[2], match[3]].filter(Boolean).join('')
      return {
        hash,
        tag,
        message: match[4].trim(),
        color,
      }
    }
    return {
      hash,
      tag: '',
      message,
      color: c => c,
    }
  })
  const tagLength = parsed.map(({ tag }) => tag.length).reduce((a, b) => Math.max(a, b), 0)
  const prettified = parsed.map(({ hash, tag, message, color }) => {
    const paddedTag = tag.padStart(tagLength + 2, ' ')
    return [
      c.dim(hash),
      ' ',
      color === c.gray ? color(paddedTag) : c.bold(color(paddedTag)),
      c.dim(':'),
      ' ',
      color === c.gray ? color(message) : message,
    ].join('')
  })

  console.log()
  console.log(
    c.bold(
      `${c.green(lines.length)} Commits since ${c.gray(sha.slice(0, 7))}:`,
    ),
  )
  console.log()
  console.log(prettified.reverse().join('\n'))
  console.log()
}
