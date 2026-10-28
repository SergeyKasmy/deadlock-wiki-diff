// Highlights the text that differs between two rendered cards, compared as sequences of non-blank text nodes.

function textNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n instanceof Text && n.data.trim() !== '') out.push(n);
  }
  return out;
}

/** Indices of `a` and `b` that are not part of their longest common subsequence. */
export function lcsUnmatched<T>(a: readonly T[], b: readonly T[]): [Set<number>, Set<number>] {
  // lcs(i, j): the LCS length of a[i..] and b[j..], in one flat table; the last row and column are the empty-suffix 0s
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  const lcs = (i: number, j: number) => {
    const v = table[i * width + j];
    if (v === undefined) throw new RangeError(`LCS cell (${i}, ${j}) is outside the ${a.length + 1}x${width} table`);
    return v;
  };
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? lcs(i + 1, j + 1) + 1 : Math.max(lcs(i + 1, j), lcs(i, j + 1));
    }
  }
  const ua = new Set(a.keys()), ub = new Set(b.keys());
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      ua.delete(i++);
      ub.delete(j++);
    } else if (lcs(i + 1, j) >= lcs(i, j + 1)) i++;
    else j++;
  }
  return [ua, ub];
}

function clearMarks(card: Element) {
  card.querySelectorAll('.diff-wrap').forEach((s) => {
    s.replaceWith(document.createTextNode(s.textContent));
  });
  card.querySelectorAll('.diff-del, .diff-add').forEach((e) => {
    e.classList.remove('diff-del', 'diff-add');
  });
  card.normalize();
}

function mark(node: Text, cls: string, card: Element) {
  // gadget-managed value elements get the class itself: the gadget parseFloat()s their innerHTML, so nothing may be wrapped inside
  const holder = node.parentElement?.closest('.ability-attr');
  if (holder && card.contains(holder)) holder.classList.add(cls);
  else {
    const s = document.createElement('span');
    s.className = `diff-wrap ${cls}`;
    node.replaceWith(s);
    s.append(node);
  }
}

/** Clears earlier marks, then marks the differences between `old` and `cur` when `on`. */
export function highlightDiff(old: Element | undefined, cur: Element | undefined, on: boolean): void {
  if (old) clearMarks(old);
  if (cur) clearMarks(cur);
  if (!on || !old || !cur) return;
  const oldNodes = textNodes(old), curNodes = textNodes(cur);
  const text = (n: Text) => n.data.trim();
  const [removed, added] = lcsUnmatched(oldNodes.map(text), curNodes.map(text));
  for (const n of oldNodes.filter((_, k) => removed.has(k))) mark(n, 'diff-del', old);
  for (const n of curNodes.filter((_, k) => added.has(k))) mark(n, 'diff-add', cur);
}
