import assert from 'node:assert/strict';

/** Check actual text geometry too: body overflow-x:clip can hide a defect
 * while document.scrollWidth still matches the viewport. Vertical page/sheet
 * scrolling is intentional; clipping of v3 text is not. */
export async function assertReadableLayout(page, area, state) {
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  const clipped = await area.evaluateAll((roots) => {
    const issues = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node; (node = walker.nextNode());) {
        if (!node.textContent.trim() || !node.parentElement.checkVisibility()) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          let left = 0, right = innerWidth, top = -Infinity, bottom = Infinity;
          for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) {
              const box = parent.getBoundingClientRect();
              left = Math.max(left, box.left); right = Math.min(right, box.right);
            }
            if (['hidden', 'clip'].includes(style.overflowY)) {
              const box = parent.getBoundingClientRect();
              top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom);
            }
          }
          if (rect.left < left - 1 || rect.right > right + 1 || rect.top < top - 1 || rect.bottom > bottom + 1)
            issues.push(node.textContent.trim().slice(0, 100));
        }
      }
    }
    return [...new Set(issues)];
  });
  assert.deepEqual(clipped, [], `${state}: clipped text`);
  for (const control of await area.locator('button, input:not([type=checkbox]), textarea, select, a.button, label.check').all()) {
    const box = await control.boundingBox();
    if (box) assert.ok(box.width >= 44 && box.height >= 44, `${state}: target below 44×44 px`);
  }
}
