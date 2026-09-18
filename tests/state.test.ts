import { describe, expect, it } from 'vitest';
import { ShelfStore, clampHeight } from '../src/state';
import { isImage, localLink } from '../src/source';
const image = { type: 'image' as const, path: 'assets/a.png' };
describe('note-level pins and tab-level presentation', () => {
  it('shares replace and unpin without synchronizing presentation', () => {
    const s = new ShelfStore(); s.reconcile(new Map([['1','A.md'],['2','A.md'],['3','B.md']]));
    s.pin('A.md',image); s.tabs.get('1')!.collapsed=true; s.tabs.get('1')!.height=400;
    expect(s.pins.get(s.tabs.get('2')!.note)).toEqual(image);
    expect(s.tabs.get('2')!.collapsed).toBe(false); expect(s.tabs.get('2')!.height).toBe(0);
    expect(s.pins.has('B.md')).toBe(false);
    s.pin('A.md',{...image,path:'b.jpg'}); expect(s.pins.size).toBe(1);
    expect(s.pins.get('A.md')!.path).toBe('b.jpg'); s.unpin('A.md'); expect(s.pins.size).toBe(0);
  });
  it('keeps hidden tabs and releases only the last membership', () => {
    const s = new ShelfStore(); s.reconcile(new Map([['1','A.md'],['2','A.md']])); s.pin('A.md',image);
    s.reconcile(new Map([['2','A.md']])); expect(s.pins.has('A.md')).toBe(true);
    s.reconcile(new Map([['2','B.md']])); expect(s.pins.size).toBe(0);
  });
  it('preserves tab identity across split moves and active tab switches', () => {
    const s = new ShelfStore(); const open = new Map([['1','A.md'],['2','B.md']]);
    s.reconcile(open); s.pin('A.md',image); const tab=s.tabs.get('1'); tab!.collapsed=true;
    s.reconcile(new Map([...open].reverse())); expect(s.tabs.get('1')).toBe(tab); expect(s.pins.size).toBe(1);
  });
  it('renames note, asset and ancestor folders without breaking bindings', () => {
    const s=new ShelfStore(); s.reconcile(new Map([['1','dir/A.md']])); s.pin('dir/A.md',{...image,path:'dir/a.png'});
    s.rename('dir','moved'); expect(s.tabs.get('1')!.note).toBe('moved/A.md'); expect(s.pins.get('moved/A.md')!.path).toBe('moved/a.png');
    s.rename('moved/a.png','moved/new.png'); expect(s.pins.get('moved/A.md')!.path).toBe('moved/new.png');
  });
  it('retains missing source descriptors for a recoverable error state', () => {
    const s=new ShelfStore(); s.reconcile(new Map([['1','A.md']])); s.pin('A.md',image);
    s.reconcile(new Map([['1','A.md']])); expect(s.pins.get('A.md')).toEqual(image);
  });
  it('starts new tabs with the latest size and clears all session state', () => {
    const s=new ShelfStore(); s.lastHeight=280; s.reconcile(new Map([['1','A.md']]));
    expect(s.tabs.get('1')!.height).toBe(280); s.pin('A.md',image); s.clear(); expect(s.tabs.size+s.pins.size).toBe(0);
  });
});
describe('safe local image sources', () => {
  it.each(['a.png','a.JPG','a.jpeg','a.webp','a.svg'])('accepts %s', value=>expect(isImage(value)).toBe(true));
  it.each(['a.md','a.excalidraw','a.pdf','https://example.com/a.png','data:image/svg+xml,x','//host/a.png','javascript:foo.png','https%3A%2F%2Fx%2Fa.png'])('rejects %s', value=>expect(localLink(value)).toBe(null));
  it('handles wiki sizes, URL encoding and fragments',()=>{
    expect(localLink('![[folder/a%20b.png|300]]')).toBe('folder/a b.png'); expect(localLink('<a.png>')).toBe('a.png');
    expect(localLink('a.svg#section')).toBe('a.svg'); expect(localLink('bad%ZZ.png')).toBe(null);
  });
});
describe('responsive bounds',()=>{
  it('clamps to 180px–70% and handles small windows',()=>{
    expect(clampHeight(10,1000)).toBe(180); expect(clampHeight(900,1000)).toBe(700);
    expect(clampHeight(180,200)).toBe(140); expect(clampHeight(NaN,1000)).toBe(320);
  });
});
