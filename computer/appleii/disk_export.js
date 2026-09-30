// Export a snapshot of the controller's current bytes, including guest writes.
export function exportHardDrive(board,drive) {
 const disk=board.prodosBlock.drives[drive];
 if(!disk?.image || disk.physical==='35')throw new Error('No hard-drive image in this drive');
 const name=disk.name.split(/[\\/]/).pop();
 if(/\.(2mg|2img)$/i.test(name)) {
  const data=new Uint8Array(64+disk.image.length),v=new DataView(data.buffer);
  data.set([0x32,0x49,0x4d,0x47,0x45,0x4d,0x55,0x20]); // 2IMG / EMU
  v.setUint16(8,64,true);v.setUint16(10,1,true);
  v.setUint32(12,1,true); // ProDOS block order
  v.setUint32(16,disk.writeProtected?0x80000000:0,true);
  v.setUint32(20,disk.blockCount,true);
  v.setUint32(24,64,true);v.setUint32(28,disk.image.length,true);
  data.set(disk.image,64);
  return {name:name.replace(/\.(2mg|2img)$/i,'-saved.2mg'),data};
 }
 return {name:name.replace(/\.[^.]+$/,'')+'-saved.hdv',data:disk.image.slice()};
}
