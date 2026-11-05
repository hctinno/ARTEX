import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vitest globals가 꺼져 있어 RTL 자동 cleanup이 등록되지 않으므로 직접 등록한다.
afterEach(() => cleanup());
