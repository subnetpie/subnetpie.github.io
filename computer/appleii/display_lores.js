//
// Apple IIe low-resolution and double-low-resolution video.
//
export class LoresDisplay {
    constructor(memory, canvas) {
        this._mem = memory;
        this._canvas = canvas;
        this._context = canvas.getContext("2d", {alpha:false});
        this._context.imageSmoothingEnabled = false;
        this._page = 1;
        this._double = false;
        this.palette = [
            0x000000,0xdd0033,0x000099,0xdd22dd,
            0x007722,0x555555,0x2222ff,0x66aaff,
            0x885500,0xff6600,0xaaaaaa,0xff9988,
            0x11dd00,0xffff00,0x44ff99,0xffffff
        ];
    }

    set_active_page(page, doubleLores=false) {
        this._page = page === 2 ? 2 : 1;
        this._double = !!doubleLores;
        this.refresh();
    }

    addressRow(addr) {
        const col = (addr & 0x7f) % 40;
        const row = (((addr - col) >> 2) & 0x18) | ((addr >> 7) & 7);
        return [row, col];
    }

    cell(addr) {
        const [row,col] = this.addressRow(addr);
        if(row > 23) return;
        const base = this._page === 2 ? 0x0800 : 0x0400;
        const a = base | (addr & 0x03ff);
        const main = this._mem._main[a], aux = this._mem._aux[a];
        const x = 2 + col * 14, y = 4 + row * 16;
        if(this._double) {
            this.paint(x, y, 7, 8, aux & 15);
            this.paint(x+7, y, 7, 8, main & 15);
            this.paint(x, y+8, 7, 8, aux >>> 4);
            this.paint(x+7, y+8, 7, 8, main >>> 4);
        } else {
            this.paint(x, y, 14, 8, main & 15);
            this.paint(x, y+8, 14, 8, main >>> 4);
        }
    }

    paint(x,y,w,h,index) {
        const c=this.palette[index&15];
        this._context.fillStyle="#"+c.toString(16).padStart(6,"0");
        this._context.fillRect(x,y,w,h);
    }

    draw(addr) { this.cell(addr); }

    refresh() {
        this._context.fillStyle="#000";
        this._context.fillRect(0,0,this._canvas.width,this._canvas.height);
        const base=this._page===2?0x0800:0x0400;
        for(let a=base;a<base+0x400;a++) this.cell(a);
    }

    reset() { this._page=1; this._double=false; }
}
