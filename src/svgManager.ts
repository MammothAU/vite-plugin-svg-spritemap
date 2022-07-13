import type { Options, Pattern, SvgMapObject } from './types'
import { readFile } from 'fs'
import { promisify } from 'util'
import fg from 'fast-glob'
import { optimize } from 'svgo'
import { DOMParser, DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import { Styles } from './styles/styles'

export class SVGManager {
  private _options: Options
  private _parser: DOMParser
  private _svgs: Map<string, SvgMapObject>
  private _iconsPattern: Pattern

  constructor(iconsPattern: Pattern, options: Options) {
    this._parser = new DOMParser()
    this._options = options
    this._svgs = new Map()
    this._iconsPattern = iconsPattern
  }

  async update(filePath: string) {
    const name = filePath.split('/').pop()?.replace('.svg', '')
    if (!name) return false

    let svg: string = await promisify(readFile)(filePath, 'utf8')
    const document = this._parser.parseFromString(svg, 'image/svg+xml')
    const documentElement = document.documentElement
    let width = documentElement.getAttribute('width')
    let height = documentElement.getAttribute('height')
    const viewBox = documentElement.getAttribute('viewBox')

    if (viewBox) {
      if (!width) {
        width = viewBox.split(' ')[2]
      }
      if (!height) {
        height = viewBox.split(' ')[3]
      }
    }

    if (this._options.svgo !== false) {
      const optimizedSvg = optimize(
        svg,
        this._options.svgo(this._options.prefix + name + '-')
      )
      if ('data' in optimizedSvg) {
        svg = optimizedSvg.data
      }
    }

    this._svgs.set(name, {
      width: Number(width),
      height: Number(height),
      source: svg
    })
  }

  async updateAll() {
    const iconsPath = await fg(this._iconsPattern)

    for (let index = 0; index < iconsPath.length; index++) {
      const iconPath = iconsPath[index]
      await this.update(iconPath)
    }
  }

  get spritemap() {
    const DOM = new DOMImplementation().createDocument(null, null, null)
    const Serializer = new XMLSerializer()
    const spritemap = DOM.createElement('svg')
    spritemap.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    // use mode
    // spritemap.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

    if (this._svgs.size) {
      const parser = new DOMParser()

      this._svgs.forEach((svg, name) => {
        const symbol = DOM.createElement('symbol')
        const document = parser.parseFromString(svg.source, 'image/svg+xml')
        const documentElement = document.documentElement
        const cleanAttributes = ['viewbox', 'width', 'height', 'id', 'xmlns']
        Array.from(documentElement.attributes)
          .filter(
            attr => !cleanAttributes.includes(attr.name.toLocaleUpperCase())
          )
          .forEach(attr => {
            symbol.setAttribute(attr.name, attr.value)
          })
        symbol.setAttribute('id', this._options.prefix + name)

        Array.from(documentElement.childNodes).forEach(child => {
          symbol.appendChild(child)
        })

        spritemap.appendChild(symbol)
      })
    }

    // use mode
    // svgs.forEach((svg, name) => {
    //   const use = DOM.createElement('use')
    //   use.setAttribute('xlink:href', `#${options.prefix}${name}`)
    //   spritemap.appendChild(use)
    // })

    return Serializer.serializeToString(spritemap)
  }

  get style() {
    if (typeof this._options.styles !== 'object') return false

    const styleGen: Styles = new Styles(
      this._svgs,
      this._options.styles.lang,
      this._options
    )
    return styleGen.generate
  }
}