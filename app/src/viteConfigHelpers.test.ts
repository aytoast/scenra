import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  byIndex,
  copyWorldAssets,
  firstIndexed,
  indexedFiles,
  latestIndexed,
  parseIndexedName,
  versionLabel,
  worldsUrl,
} from '../vite.config.ts'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.webp'])
const MODEL_EXTENSIONS = new Set(['.glb'])

function file(name: string) {
  return { name }
}

describe('vite indexed artifact helpers', () => {
  it('packages generated world and prop assets when Windows materializes symlink as file', () => {
    const temporaryDirectory = fs.realpathSync(os.tmpdir())
    const fixture = fs.mkdtempSync(path.join(temporaryDirectory, 'scenra-worlds-'))
    try {
      const source = path.join(fixture, 'worlds')
      const destination = path.join(fixture, 'dist', 'worlds')
      const assets = ['courtyard/output/world/0-world.spz', 'courtyard/output/world/0-world.glb', 'courtyard/output/table/0-table.glb', 'courtyard/source/0-source.png']
      for (const asset of assets) {
        const file = path.join(source, asset)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, Buffer.from([0x67, 0x6c, 0x54, 0x46, 0, 1, 2, 3]))
      }
      fs.writeFileSync(path.join(source, '.env'), 'PRIVATE_TEST_KEY=never-publish')
      fs.writeFileSync(path.join(source, 'courtyard/output/world/.0-world-request.json'), '{}')
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, '../../worlds')
      copyWorldAssets(source, destination)
      for (const asset of assets) expect(fs.readFileSync(path.join(destination, asset))).toEqual(fs.readFileSync(path.join(source, asset)))
      expect(fs.existsSync(path.join(destination, '.env'))).toBe(false)
      expect(fs.existsSync(path.join(destination, 'courtyard/output/world/.0-world-request.json'))).toBe(false)
    } finally {
      if (path.dirname(fixture) === temporaryDirectory) fs.rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('parses indexed names and sorts indexed files before non-indexed fallbacks', () => {
    expect(parseIndexedName('12-world-pano.PNG')).toEqual({
      index: 12,
      slug: 'world-pano',
      extension: '.png',
      name: '12-world-pano.PNG',
    })
    expect(parseIndexedName('.2-tree__model-request.json')).toEqual({
      index: 2,
      slug: 'tree',
      scope: 'model',
      extension: '.json',
      hidden: true,
      name: '.2-tree__model-request.json',
    })

    const files = indexedFiles([
      file('10-source.png'),
      file('source.png'),
      file('2-source.png'),
      file('0-source.png'),
    ], { extensions: IMAGE_EXTENSIONS })

    expect(files.map((entry) => entry.name)).toEqual([
      '0-source.png',
      '2-source.png',
      '10-source.png',
      'source.png',
    ])
    expect(versionLabel(files[1])).toBe('v2')
    expect(versionLabel(files[3])).toBe('source')
  })

  it('defaults source image selection to the zeroth indexed source image', () => {
    const sourceImages = indexedFiles([
      file('2-source.png'),
      file('0-source.png'),
      file('1-source.png'),
    ], { extensions: IMAGE_EXTENSIONS })

    const defaultSource = byIndex(sourceImages, 0) ?? firstIndexed(sourceImages)

    expect(defaultSource?.name).toBe('0-source.png')
    expect(worldsUrl('demo', 'source/0-source.png')).toBe('/worlds/demo/source/0-source.png')
  })

  it('supports representative object thumbnail and world version lookups', () => {
    const objectFiles = [
      file('0-tree.glb'),
      file('0-tree-thumbnail.webp'),
      file('1-tree.glb'),
      file('1-tree-thumbnail.webp'),
    ]
    const models = indexedFiles(objectFiles, { extensions: MODEL_EXTENSIONS })
    const thumbnails = indexedFiles(objectFiles, { extensions: IMAGE_EXTENSIONS })
    const selectedModel = byIndex(models, 1)
    const selectedThumbnail = thumbnails.find((image) => image.index === selectedModel?.index && image.name.includes('thumbnail'))

    expect(selectedModel?.name).toBe('1-tree.glb')
    expect(selectedThumbnail?.name).toBe('1-tree-thumbnail.webp')

    const worldPanos = indexedFiles([
      file('0-world-pano.png'),
      file('3-world-pano.png'),
      file('1-world-pano.png'),
    ], {
      extensions: IMAGE_EXTENSIONS,
      slugs: new Set(['world-pano']),
    })

    expect(latestIndexed(worldPanos)?.name).toBe('3-world-pano.png')
  })
})
