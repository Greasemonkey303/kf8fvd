"use client"

import React, { useEffect, useState } from 'react'
import { Extension, mergeAttributes, Node } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import styles from '../../app/admin/admin.module.css'

type RichTextEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
  expandedMinHeight?: number
}

const FONT_OPTIONS = [
  { label: 'Default', value: '' },
  { label: 'Serif', value: 'Georgia, Times New Roman, serif' },
  { label: 'Sans', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Monospace', value: 'Courier New, monospace' },
  { label: 'Garamond', value: 'Garamond, Baskerville, serif' },
  { label: 'Trebuchet', value: 'Trebuchet MS, Verdana, sans-serif' },
]

const SIZE_OPTIONS = [
  { label: 'Default', value: '' },
  { label: 'Small', value: '0.9rem' },
  { label: 'Body', value: '1rem' },
  { label: 'Large', value: '1.15rem' },
  { label: 'XL', value: '1.35rem' },
  { label: '2XL', value: '1.7rem' },
]

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize || null,
            renderHTML: attributes => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})

const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      title: { default: 'Embedded content' },
      width: { default: '100%' },
      height: { default: '420' },
      allow: { default: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share' },
      referrerpolicy: { default: 'strict-origin-when-cross-origin' },
      loading: { default: 'lazy' },
      allowfullscreen: {
        default: 'true',
        parseHTML: element => element.getAttribute('allowfullscreen') ?? 'true',
      },
    }
  },
  parseHTML() {
    return [{ tag: 'iframe' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes({ class: 'admin-rich-embed' }, HTMLAttributes)]
  },
})

function normalizeHtml(html: string | null | undefined) {
  const raw = String(html || '').trim()
  if (!raw) return ''
  if (raw === '<p></p>' || raw === '<p><br></p>') return ''
  return raw
}

function youtubeEmbedSrc(input: string) {
  try {
    const url = new URL(input)
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace(/^\//, '').trim()
      return id ? `https://www.youtube.com/embed/${id}` : ''
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v')
        return id ? `https://www.youtube.com/embed/${id}` : ''
      }
      if (url.pathname.startsWith('/embed/')) return input
    }
  } catch {}
  return ''
}

function vimeoEmbedSrc(input: string) {
  try {
    const url = new URL(input)
    if (!url.hostname.includes('vimeo.com')) return ''
    const parts = url.pathname.split('/').filter(Boolean)
    const id = parts[parts.length - 1]
    return id ? `https://player.vimeo.com/video/${id}` : ''
  } catch {}
  return ''
}

function parseIframeMarkup(raw: string) {
  const src = raw.match(/src=["']([^"']+)["']/i)?.[1]
  if (!src) return null
  return {
    src,
    title: raw.match(/title=["']([^"']+)["']/i)?.[1] || 'Embedded content',
    width: raw.match(/width=["']([^"']+)["']/i)?.[1] || '100%',
    height: raw.match(/height=["']([^"']+)["']/i)?.[1] || '420',
    allow: raw.match(/allow=["']([^"']+)["']/i)?.[1] || 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
  }
}

function parseEmbedInput(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.includes('<iframe')) return parseIframeMarkup(trimmed)
  const youtube = youtubeEmbedSrc(trimmed)
  if (youtube) return { src: youtube, title: 'YouTube video', width: '100%', height: '420' }
  const vimeo = vimeoEmbedSrc(trimmed)
  if (vimeo) return { src: vimeo, title: 'Vimeo video', width: '100%', height: '420' }
  try {
    new URL(trimmed)
    return { src: trimmed, title: 'Embedded content', width: '100%', height: '420' }
  } catch {
    return null
  }
}

function ToolbarButton({
  active = false,
  onClick,
  disabled = false,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`${styles.btnGhost} ${styles.btnGhostSmall} ${active ? styles.richTextToolbarButtonActive : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({ value, onChange, placeholder = 'Write here…', minHeight = 220, expandedMinHeight }: RichTextEditorProps) {
  const [sourceMode, setSourceMode] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [sourceValue, setSourceValue] = useState(normalizeHtml(value))
  const expandedHeight = Math.max(minHeight, expandedMinHeight ?? minHeight + 180)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Image,
      Embed,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: normalizeHtml(value),
    onUpdate: ({ editor: currentEditor }) => {
      onChange(normalizeHtml(currentEditor.getHTML()))
    },
    editorProps: {
      attributes: {
        class: styles.richTextSurface,
      },
    },
  })

  useEffect(() => {
    const next = normalizeHtml(value)
    setSourceValue(next)
    if (!editor) return
    const current = normalizeHtml(editor.getHTML())
    if (current !== next) {
      editor.commands.setContent(next || '<p></p>', { emitUpdate: false })
    }
  }, [editor, value])

  if (!editor) {
    return <div className={styles.richTextLoading}>Loading editor…</div>
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href || ''
    const url = window.prompt('Enter link URL', previousUrl)
    if (url === null) return
    const trimmed = url.trim()
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
  }

  const setImage = () => {
    const src = window.prompt('Enter image URL')
    if (!src) return
    const trimmed = src.trim()
    if (!trimmed) return
    const alt = window.prompt('Enter image alt text (optional)', '') || ''
    editor.chain().focus().setImage({ src: trimmed, alt }).run()
  }

  const setEmbed = () => {
    const raw = window.prompt('Paste a YouTube/Vimeo URL, a direct embed URL, or full iframe HTML')
    if (!raw) return
    const embed = parseEmbedInput(raw)
    if (!embed?.src) {
      window.alert('Could not parse that embed. Use source view for custom HTML.')
      return
    }
    editor.chain().focus().insertContent({ type: 'embed', attrs: embed }).run()
  }

  const toggleSourceMode = () => {
    if (!sourceMode && editor) {
      setSourceValue(normalizeHtml(editor.getHTML()))
    }
    if (sourceMode && editor) {
      editor.commands.setContent(normalizeHtml(sourceValue) || '<p></p>')
    }
    setSourceMode(current => !current)
  }

  const currentMinHeight = isExpanded ? expandedHeight : minHeight
  const activeTextStyle = editor.getAttributes('textStyle') as { color?: string; fontFamily?: string; fontSize?: string }
  const activeColor = activeTextStyle.color || '#e6eef8'
  const activeFontFamily = activeTextStyle.fontFamily || ''
  const activeFontSize = activeTextStyle.fontSize || ''
  const activeAlign = (editor.getAttributes('paragraph') as { textAlign?: string }).textAlign || (editor.getAttributes('heading') as { textAlign?: string }).textAlign || 'left'

  const setFontFamily = (nextValue: string) => {
    if (!nextValue) {
      editor.chain().focus().unsetFontFamily().run()
      return
    }
    editor.chain().focus().setFontFamily(nextValue).run()
  }

  const setFontSize = (nextValue: string) => {
    if (!nextValue) {
      editor.commands.unsetFontSize()
      return
    }
    editor.commands.setFontSize(nextValue)
  }

  const setTextColor = (nextValue: string) => {
    if (!nextValue) {
      editor.chain().focus().unsetColor().run()
      return
    }
    editor.chain().focus().setColor(nextValue).run()
  }

  return (
    <div className={styles.richTextEditor}>
      <div className={styles.richTextToolbar}>
        <div className={styles.richTextToolbarSection}>
          <label className={styles.richTextSelectWrap}>
            <span className={styles.richTextControlLabel}>Font</span>
            <select className={styles.richTextSelect} value={activeFontFamily} onChange={(event) => setFontFamily(event.target.value)} disabled={sourceMode}>
              {FONT_OPTIONS.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className={styles.richTextSelectWrap}>
            <span className={styles.richTextControlLabel}>Size</span>
            <select className={styles.richTextSelect} value={activeFontSize} onChange={(event) => setFontSize(event.target.value)} disabled={sourceMode}>
              {SIZE_OPTIONS.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className={styles.richTextColorWrap}>
            <span className={styles.richTextControlLabel}>Color</span>
            <input className={styles.richTextColorInput} type="color" value={activeColor} onChange={(event) => setTextColor(event.target.value)} disabled={sourceMode} />
          </label>
        </div>
        <div className={styles.richTextToolbarSection}>
        <ToolbarButton title="Bold" active={!sourceMode && editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} disabled={sourceMode}>
          B
        </ToolbarButton>
        <ToolbarButton title="Italic" active={!sourceMode && editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} disabled={sourceMode}>
          I
        </ToolbarButton>
        <ToolbarButton title="Underline" active={!sourceMode && editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} disabled={sourceMode}>
          U
        </ToolbarButton>
        <ToolbarButton title="Strike" active={!sourceMode && editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} disabled={sourceMode}>
          S
        </ToolbarButton>
        <ToolbarButton title="Highlight" active={!sourceMode && editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight({ color: '#7dd3fc55' }).run()} disabled={sourceMode}>
          Mark
        </ToolbarButton>
        <ToolbarButton title="Heading 2" active={!sourceMode && editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} disabled={sourceMode}>
          H2
        </ToolbarButton>
        <ToolbarButton title="Heading 3" active={!sourceMode && editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} disabled={sourceMode}>
          H3
        </ToolbarButton>
        <ToolbarButton title="Bullet List" active={!sourceMode && editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} disabled={sourceMode}>
          • List
        </ToolbarButton>
        <ToolbarButton title="Numbered List" active={!sourceMode && editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} disabled={sourceMode}>
          1. List
        </ToolbarButton>
        <ToolbarButton title="Blockquote" active={!sourceMode && editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} disabled={sourceMode}>
          Quote
        </ToolbarButton>
        <ToolbarButton title="Code Block" active={!sourceMode && editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} disabled={sourceMode}>
          Code
        </ToolbarButton>
        </div>
        <div className={styles.richTextToolbarSection}>
        <ToolbarButton title="Align left" active={!sourceMode && activeAlign === 'left'} onClick={() => editor.chain().focus().setTextAlign('left').run()} disabled={sourceMode}>
          Left
        </ToolbarButton>
        <ToolbarButton title="Align center" active={!sourceMode && activeAlign === 'center'} onClick={() => editor.chain().focus().setTextAlign('center').run()} disabled={sourceMode}>
          Center
        </ToolbarButton>
        <ToolbarButton title="Align right" active={!sourceMode && activeAlign === 'right'} onClick={() => editor.chain().focus().setTextAlign('right').run()} disabled={sourceMode}>
          Right
        </ToolbarButton>
        <ToolbarButton title="Link" active={!sourceMode && editor.isActive('link')} onClick={setLink} disabled={sourceMode}>
          Link
        </ToolbarButton>
        <ToolbarButton title="Image" onClick={setImage} disabled={sourceMode}>
          Image
        </ToolbarButton>
        <ToolbarButton title="Embed" onClick={setEmbed} disabled={sourceMode}>
          Embed
        </ToolbarButton>
        <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} disabled={sourceMode}>
          Clear
        </ToolbarButton>
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={sourceMode || !editor.can().chain().focus().undo().run()}>
          Undo
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={sourceMode || !editor.can().chain().focus().redo().run()}>
          Redo
        </ToolbarButton>
        </div>
        <div className={styles.richTextToolbarSection}>
        <ToolbarButton title={advancedOpen ? 'Hide advanced tools' : 'Show advanced tools'} active={advancedOpen} onClick={() => setAdvancedOpen(current => !current)}>
          Advanced
        </ToolbarButton>
        <ToolbarButton title={isExpanded ? 'Collapse editor' : 'Expand editor'} active={isExpanded} onClick={() => setIsExpanded(current => !current)}>
          Expand
        </ToolbarButton>
        </div>
      </div>
      {advancedOpen ? (
        <div className={styles.richTextAdvancedRow}>
          <ToolbarButton title={sourceMode ? 'Return to visual editor' : 'Edit source HTML'} active={sourceMode} onClick={toggleSourceMode}>
            HTML
          </ToolbarButton>
          <ToolbarButton title="Clear text color" onClick={() => editor.chain().focus().unsetColor().run()} disabled={sourceMode}>
            Clear Color
          </ToolbarButton>
          <ToolbarButton title="Clear highlight" onClick={() => editor.chain().focus().unsetHighlight().run()} disabled={sourceMode}>
            Clear Mark
          </ToolbarButton>
          <ToolbarButton title="Reset alignment" onClick={() => editor.chain().focus().unsetTextAlign().run()} disabled={sourceMode}>
            Reset Align
          </ToolbarButton>
        </div>
      ) : null}
      <div className={styles.richTextFrame} style={{ minHeight: currentMinHeight }}>
        {sourceMode ? (
          <textarea
            className={styles.richTextSource}
            value={sourceValue}
            onChange={(event) => {
              const next = event.target.value
              setSourceValue(next)
              onChange(next)
            }}
            style={{ minHeight: currentMinHeight }}
            spellCheck={false}
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
      <div className={styles.richTextMeta}>
        {sourceMode ? 'Source mode preserves HTML directly.' : 'Visual mode supports fonts, color, alignment, images, embeds, and advanced source editing when needed.'}
      </div>
    </div>
  )
}