export function isEditableEditorTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  const editable = element.closest("input, textarea, select, [contenteditable], [role='textbox']");
  return Boolean(editable && editable.getAttribute('contenteditable') !== 'false');
}
