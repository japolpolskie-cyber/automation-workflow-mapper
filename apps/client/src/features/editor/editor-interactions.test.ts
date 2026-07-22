// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEditableEditorTarget } from './editor-interactions';

describe('editor keyboard safety', () => {
  it('does not treat Delete or Backspace inside form controls as editor deletion', () => {
    for (const element of [document.createElement('input'), document.createElement('textarea'), document.createElement('select')]) {
      document.body.append(element);
      expect(isEditableEditorTarget(element)).toBe(true);
      element.remove();
    }
    const editable = document.createElement('div'); editable.setAttribute('contenteditable', 'true'); document.body.append(editable);
    expect(isEditableEditorTarget(editable)).toBe(true);
    expect(isEditableEditorTarget(document.body)).toBe(false);
  });
});
