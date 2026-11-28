"""Jules · make_textures.py
Draws the book textures from scratch (no photos, nothing borrowed), as small greyscale PNGs that
tile seamlessly. The CSS lays them over a colour with a blend mode, so one texture serves every
book: mid-grey (128) leaves the colour as it is, lighter lifts it, darker deepens it.

    python3 tools/make_textures.py      # writes tex/cloth.png, tex/leather.png, tex/paper.png, tex/wood.png

Everything is built so the left edge meets the right and the top meets the bottom: noise is made
in frequency space (which wraps by nature), and distances wrap around the tile."""
import numpy as np
from PIL import Image
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "tex")
rng = np.random.default_rng(1969)


def noise(h, w, beta=1.0, ax=1.0, ay=1.0):
    """Tileable fractal noise: white noise shaped by 1/f^beta. ax/ay > 1 squash it along that axis
    (ay large makes streaks that run left to right, like wood grain). Returns values in about -1..1."""
    fy = np.fft.fftfreq(h)[:, None] * ay
    fx = np.fft.fftfreq(w)[None, :] * ax
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = np.inf
    spec = np.fft.fft2(rng.normal(size=(h, w))) / f ** beta
    n = np.real(np.fft.ifft2(spec))
    return n / (np.abs(n).max() + 1e-9)


def save(name, a, mean=128, spread=1.0):
    """a: any float array. Centre it on `mean` and keep it inside 0..255."""
    a = (a - a.mean()) / (a.std() + 1e-9) * 22 * spread + mean
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "L").save(os.path.join(OUT, name), optimize=True)
    print(name, a.shape)


def cloth(n=256, p=4):
    """Book cloth: a plain weave. Threads `p` pixels apart go over and under each other in turn;
    each thread has its own thickness, slubs (thick bits) along its length, and a little fuzz."""
    y, x = np.mgrid[0:n, 0:n].astype(float)
    i, j = (x // p).astype(int), (y // p).astype(int)
    k = n // p
    warp_w = 0.75 + 0.25 * rng.random(k)                 # each vertical thread's thickness
    weft_w = 0.75 + 0.25 * rng.random(k)                 # each horizontal thread's thickness
    across_x = (x % p) / p - 0.5                          # where we are across a vertical thread
    across_y = (y % p) / p - 0.5
    warp = np.cos(np.pi * across_x) ** 2 * warp_w[i]      # a rounded thread, lit along its middle
    weft = np.cos(np.pi * across_y) ** 2 * weft_w[j]
    slub_v = noise(n, n, 1.4, ax=8, ay=0.6)               # thickness wandering along the threads
    slub_h = noise(n, n, 1.4, ax=0.6, ay=8)
    top = ((i + j) % 2 == 0)                              # plain weave: over, under, over…
    a = np.where(top, warp * (1 + 0.35 * slub_v) - 0.25 * (1 - np.cos(np.pi * across_y) ** 2),
                 weft * (1 + 0.35 * slub_h) - 0.25 * (1 - np.cos(np.pi * across_x) ** 2))
    a += 0.25 * noise(n, n, 0.4)                          # fuzz
    a += 0.35 * noise(n, n, 1.8)                          # uneven dye and wear, over larger patches
    save("cloth.png", a, spread=1.05)


def leather(n=256, cells=900):
    """Pebble-grain leather: many small, rounded pebbles with soft creases between them, lit from
    the top left so they read as bumps, a second finer crease network, and pores."""
    y, x = np.mgrid[0:n, 0:n].astype(float)

    def worley(count):
        pts = rng.random((count, 2)) * n
        f1 = np.full((n, n), np.inf); f2 = np.full((n, n), np.inf)
        for px, py in pts:                                # nearest and second-nearest point, wrapping
            dx = np.abs(x - px); dx = np.minimum(dx, n - dx)
            dy = np.abs(y - py); dy = np.minimum(dy, n - dy)
            d = np.sqrt(dx * dx + dy * dy)
            f2 = np.where(d < f1, f1, np.minimum(f2, d)); f1 = np.minimum(f1, d)
        return f1, f2

    f1, f2 = worley(cells)
    crease = np.exp(-((f2 - f1) / 2.4) ** 2)              # soft valley between pebbles
    dome = 1 - (f1 / (f1 + f2 + 1e-9) * 2) ** 2           # each pebble rounded towards its middle
    g1, g2 = worley(cells // 4)
    big = np.exp(-((g2 - g1) / 3.5) ** 2)                 # a larger, fainter crease network
    h = 0.8 * dome - 0.7 * crease - 0.35 * big + 0.2 * noise(n, n, 1.4)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2       # slope, wrapping at the edges
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2
    shade = -(gx * -0.6 + gy * -0.6) * 2.2                # light from the top left
    pores = (rng.random((n, n)) > 0.992) * -1.0
    a = shade + 0.35 * h + pores * 0.5 + 0.35 * noise(n, n, 1.9)
    save("leather.png", a, spread=0.8)


def paper(n=256):
    """Paper: a soft cloudy formation, fine tooth, and a scatter of short fibres."""
    a = 0.6 * noise(n, n, 1.6) + 0.35 * noise(n, n, 0.5)
    fib = np.zeros((n, n))
    for _ in range(420):
        x0, y0 = rng.random(2) * n
        ang = rng.random() * np.pi
        L = 6 + rng.random() * 18
        for t in np.linspace(0, L, int(L * 2)):
            xx = int(x0 + np.cos(ang) * t + np.sin(t * 0.3) * 1.2) % n
            yy = int(y0 + np.sin(ang) * t) % n
            fib[yy, xx] += 1
    a += 0.5 * fib * (rng.random() * 0.5 + 0.5)
    save("paper.png", a, spread=0.55)


def wood(w=512, h=128):
    """Wood grain running left to right: growth rings pushed about by slow noise, fine fibres along
    the grain, and a few darker figure lines."""
    y, x = np.mgrid[0:h, 0:w].astype(float)
    warp = noise(h, w, 2.2, ax=5.0, ay=1.0)               # slow along the board, gentle across it
    rings = np.sin(2 * np.pi * (y / h * 5 + warp * 1.4))
    rings = np.sign(rings) * np.abs(rings) ** 0.5
    fibres = noise(h, w, 0.8, ax=14.0, ay=0.6)            # thin streaks along the grain
    figure = np.clip(noise(h, w, 1.6, ax=8.0, ay=1.0) - 0.45, 0, None) * -2.5
    a = 0.45 * rings + 0.9 * fibres + figure + 0.25 * noise(h, w, 1.8, ax=3, ay=1)
    save("wood.png", a, spread=1.0)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    cloth(); leather(); paper(); wood()
