import type { CodeThemeId } from './theme';

export interface CodeThemeOption {
  id: CodeThemeId;
  label: string;
}

export const CODE_THEMES: CodeThemeOption[] = [
  { id: 'auto', label: 'Auto (match app)' },
  { id: 'github-light', label: 'GitHub Light' },
  { id: 'github-dark', label: 'GitHub Dark' },
  { id: 'one-dark', label: 'One Dark' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'nord', label: 'Nord' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'solarized-light', label: 'Solarized Light' },
];

/**
 * Map a file path's extension to a refractor language present in the common
 * bundle. Returns undefined when we have no good highlighter (renders plain).
 */
export function detectLanguage(path: string): string | undefined {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    html: 'markup',
    htm: 'markup',
    xml: 'markup',
    svg: 'markup',
    vue: 'markup',
    md: 'markdown',
    markdown: 'markdown',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    sql: 'sql',
    swift: 'swift',
    toml: 'toml',
    diff: 'diff',
    graphql: 'graphql',
    gql: 'graphql',
  };
  return map[ext];
}
