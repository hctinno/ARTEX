export interface ThemeTokens {
  bg: string;
  pane: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  addText: string;
  delText: string;
  warnText: string;
}

export const tokens: Record<'light' | 'dark', ThemeTokens> = {
  light: {
    bg: '#E9E9EE',
    pane: '#FFFFFF',
    card: '#F3F3F6',
    text: '#1C1C1E',
    muted: '#6C6C70',
    accent: '#0B6BDB',
    addText: '#1B7A3C',
    delText: '#B3261E',
    warnText: '#8F4A00',
  },
  dark: {
    bg: '#000000',
    pane: '#161618',
    card: '#232326',
    text: '#F5F5F7',
    muted: '#A1A1A8',
    accent: '#1F6FE5',
    addText: '#5FD98A',
    delText: '#FF8A80',
    warnText: '#FFB340',
  },
};
