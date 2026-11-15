import { afterEach, expect, it, vi } from "vitest";
import { prepararFoto } from "../src/lib/prepare-photo";
afterEach(() => vi.unstubAllGlobals());
it("prepara original grande, limita a 2048px e reduz JPEG só se necessário", async () => {
  const qualities: number[] = [];
  const drawImage = vi.fn();
  const canvas = {width:0,height:0,getContext: () => ({fillStyle:"",fillRect:vi.fn(),drawImage}),
    toBlob: (cb: (b: Blob) => void, type: string, quality: number) => { qualities.push(quality); cb(new Blob([new Uint8Array(quality === 0.9 ? 3*1024*1024 : 1024)],{type})); }};
  vi.stubGlobal("Image", class { naturalWidth=4096; naturalHeight=3072; src=""; decode=async () => {}; });
  vi.stubGlobal("document", {createElement: () => canvas});
  const original = new File([new Uint8Array(4*1024*1024)], "camera.heic", {type:"image/heic"});
  const photo = await prepararFoto(original);
  expect([canvas.width,canvas.height]).toEqual([2048,1536]);
  expect(qualities).toEqual([0.9,0.85]);
  expect(photo.type).toBe("image/jpeg");
  expect(photo.size).toBeLessThan(3*1024*1024);
  expect(drawImage).toHaveBeenCalledTimes(1);
});
it("preserva PDFs e XML sem recompressão", async () => {
  const file = new File(["xml"],"nota.xml",{type:"application/xml"});
  expect(await prepararFoto(file)).toBe(file);
});
