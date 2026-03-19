import { useCallback, useRef } from 'react'

const DEFAULT_CODE = `// Try editing this code!
const add = (a, b) => a + b;

function greet(name) {
  const message = "Hello, " + name;
  console.log(message);
  return message;
}

const result = add(1, 2);
const unused = 42; // dead code — wire goes nowhere

if (result > 2) {
  greet("world");
} else {
  greet("nobody");
}

function deadFunction() { // unreachable if never called
  return "never used";
}
`

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  fileName: string
  onFileNameChange: (name: string) => void
  onOpenProject?: () => void
}

export function CodeEditor({ value, onChange, fileName, onFileNameChange, onOpenProject }: CodeEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
    },
    [onChange],
  )

  const handleFileOpen = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      onFileNameChange(file.name)
      const reader = new FileReader()
      reader.onload = () => {
        onChange(reader.result as string)
      }
      reader.readAsText(file)
      // Reset so same file can be re-selected
      e.target.value = ''
    },
    [onChange, onFileNameChange],
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>{fileName}</span>
        <button style={styles.openBtn} onClick={handleFileOpen}>
          Open File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ts,.tsx,.js,.jsx,.mjs,.cjs"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
      </div>
      <textarea
        style={styles.textarea}
        value={value}
        onChange={handleChange}
        spellCheck={false}
        placeholder="Paste JavaScript or TypeScript here..."
      />
    </div>
  )
}

CodeEditor.DEFAULT_CODE = DEFAULT_CODE

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: '#1e1e1e',
    borderRight: '1px solid #333',
  },
  header: {
    padding: '8px 12px',
    backgroundColor: '#252525',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    color: '#ccc',
    fontSize: '12px',
    fontFamily: 'monospace',
    fontWeight: 'bold' as const,
    flex: 1,
  },
  openBtn: {
    padding: '3px 10px',
    backgroundColor: '#2a5a3a',
    color: '#ccc',
    border: '1px solid #3a7a4a',
    borderRadius: '3px',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  textarea: {
    flex: 1,
    padding: '12px',
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#d4d4d4',
    backgroundColor: '#1e1e1e',
    border: 'none',
    outline: 'none',
    resize: 'none' as const,
    tabSize: 2,
  },
}
