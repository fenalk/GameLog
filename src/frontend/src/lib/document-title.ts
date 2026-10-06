import { useEffect } from 'react';

/** Atualiza `document.title` por página (seção 5 da SPEC F3). */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
