import { useCallback, useRef } from 'react'

const SAMPLES: Record<string, string> = {
  'Intro': `// Try editing this code!
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
`,

  'Observer Pattern': `class EventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  emit(event, ...args) {
    const handlers = this.listeners[event];
    if (!handlers) return false;
    for (const handler of handlers) {
      handler(...args);
    }
    return true;
  }

  off(event, callback) {
    const handlers = this.listeners[event];
    if (!handlers) return;
    this.listeners[event] = handlers.filter(h => h !== callback);
  }
}

const bus = new EventEmitter();

function logger(msg) {
  console.log("[LOG]", msg);
}

function alerter(msg) {
  console.warn("[ALERT]", msg);
}

bus.on("message", logger);
bus.on("message", alerter);
bus.emit("message", "hello world");
bus.off("message", alerter);
`,

  'Binary Search': `function binarySearch(arr, target) {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = arr[mid];

    if (value === target) {
      return mid;
    } else if (value < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return -1;
}

const sorted = [1, 3, 5, 7, 9, 11, 13, 15];
const index = binarySearch(sorted, 7);
const missing = binarySearch(sorted, 4);
console.log("Found at:", index);
console.log("Missing:", missing);
`,

  'Strategy Pattern': `interface Strategy {
  execute(a: number, b: number): number;
}

const addStrategy: Strategy = {
  execute: (a, b) => a + b,
};

const multiplyStrategy: Strategy = {
  execute: (a, b) => a * b,
};

const subtractStrategy: Strategy = {
  execute: (a, b) => a - b,
};

class Calculator {
  strategy: Strategy;

  constructor(strategy: Strategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy: Strategy) {
    this.strategy = strategy;
  }

  calculate(a: number, b: number): number {
    return this.strategy.execute(a, b);
  }
}

const calc = new Calculator(addStrategy);
const sum = calc.calculate(10, 5);

calc.setStrategy(multiplyStrategy);
const product = calc.calculate(10, 5);

calc.setStrategy(subtractStrategy);
const diff = calc.calculate(10, 5);
`,

  'Linked List': `class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
    this.size = 0;
  }

  push(value) {
    const node = new Node(value);
    if (!this.head) {
      this.head = node;
    } else {
      let current = this.head;
      while (current.next) {
        current = current.next;
      }
      current.next = node;
    }
    this.size++;
  }

  find(value) {
    let current = this.head;
    while (current) {
      if (current.value === value) {
        return current;
      }
      current = current.next;
    }
    return null;
  }

  remove(value) {
    if (!this.head) return false;
    if (this.head.value === value) {
      this.head = this.head.next;
      this.size--;
      return true;
    }
    let prev = this.head;
    let current = this.head.next;
    while (current) {
      if (current.value === value) {
        prev.next = current.next;
        this.size--;
        return true;
      }
      prev = current;
      current = current.next;
    }
    return false;
  }
}

const list = new LinkedList();
list.push(10);
list.push(20);
list.push(30);
const found = list.find(20);
list.remove(20);
`,

  'Merge Sort': `function mergeSort(arr) {
  if (arr.length <= 1) return arr;

  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));

  return merge(left, right);
}

function merge(left, right) {
  const result = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      result.push(left[i]);
      i++;
    } else {
      result.push(right[j]);
      j++;
    }
  }

  while (i < left.length) {
    result.push(left[i]);
    i++;
  }

  while (j < right.length) {
    result.push(right[j]);
    j++;
  }

  return result;
}

const unsorted = [38, 27, 43, 3, 9, 82, 10];
const sorted = mergeSort(unsorted);
console.log(sorted);
`,

  'Promise Chain': `function fetchUser(id) {
  return new Promise((resolve, reject) => {
    if (id <= 0) {
      reject(new Error("Invalid ID"));
    }
    resolve({ id, name: "User " + id });
  });
}

function fetchPosts(user) {
  return new Promise((resolve) => {
    resolve([
      { title: "First post", author: user.name },
      { title: "Second post", author: user.name },
    ]);
  });
}

function formatPosts(posts) {
  return posts.map(p => p.author + ": " + p.title);
}

async function displayUserPosts(userId) {
  try {
    const user = await fetchUser(userId);
    const posts = await fetchPosts(user);
    const formatted = formatPosts(posts);
    for (const line of formatted) {
      console.log(line);
    }
    return formatted;
  } catch (error) {
    console.error("Failed:", error.message);
    return [];
  }
}

displayUserPosts(1);
displayUserPosts(-1);
`,

  'State Machine': `type State = "idle" | "loading" | "success" | "error";
type Event = "fetch" | "resolve" | "reject" | "reset";

interface Machine {
  state: State;
  data: any;
  error: string | null;
}

function transition(machine: Machine, event: Event, payload?: any): Machine {
  switch (machine.state) {
    case "idle":
      if (event === "fetch") {
        return { state: "loading", data: null, error: null };
      }
      break;
    case "loading":
      if (event === "resolve") {
        return { state: "success", data: payload, error: null };
      }
      if (event === "reject") {
        return { state: "error", data: null, error: payload };
      }
      break;
    case "success":
    case "error":
      if (event === "reset") {
        return { state: "idle", data: null, error: null };
      }
      break;
  }
  return machine;
}

let machine: Machine = { state: "idle", data: null, error: null };
machine = transition(machine, "fetch");
machine = transition(machine, "resolve", { items: [1, 2, 3] });
machine = transition(machine, "reset");
machine = transition(machine, "fetch");
machine = transition(machine, "reject", "Network error");
`,

  'Decorator Pattern': `function withLogging(fn) {
  return function (...args) {
    console.log("Calling", fn.name, "with", args);
    const result = fn(...args);
    console.log("Result:", result);
    return result;
  };
}

function withTiming(fn) {
  return function (...args) {
    const start = performance.now();
    const result = fn(...args);
    const elapsed = performance.now() - start;
    console.log(fn.name, "took", elapsed, "ms");
    return result;
  };
}

function withCache(fn) {
  const cache = new Map();
  return function (...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const enhanced = withLogging(withTiming(withCache(fibonacci)));
enhanced(10);
enhanced(10); // cached
enhanced(20);
`,
}

const DEFAULT_CODE = SAMPLES['Intro']

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

  const handleSampleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value
      if (name && SAMPLES[name]) {
        onChange(SAMPLES[name])
        onFileNameChange(name)
      }
      // Move focus to canvas so keyboard shortcuts keep working
      const canvas = document.querySelector('canvas')
      if (canvas) { canvas.tabIndex = -1; canvas.focus() }
    },
    [onChange, onFileNameChange],
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>{fileName}</span>
        <select style={styles.sampleSelect} onChange={handleSampleChange} value="">
          <option value="" disabled>Samples</option>
          {Object.keys(SAMPLES).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
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
  sampleSelect: {
    padding: '3px 6px',
    backgroundColor: '#333',
    color: '#ccc',
    border: '1px solid #555',
    borderRadius: '3px',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: 'pointer',
    outline: 'none',
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
