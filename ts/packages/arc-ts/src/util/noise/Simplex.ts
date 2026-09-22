// 源: arc-core/src/arc/util/noise/Simplex.java
// 移植: 与 Java 原版逐字对齐；perm() 用 Math.imul 复现 Java int 溢出语义；数值 float64

// TODO 与原版一致：范围/输出未文档化，保持逐字移植
export class Simplex{
  static readonly grad3: number[][] = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
  ];

  static readonly grad4: number[][] = [
    [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
    [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
    [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
    [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
    [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
    [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
    [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
    [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0]
  ];

  static readonly simplex: number[][] = [
    [0, 1, 2, 3], [0, 1, 3, 2], [0, 0, 0, 0], [0, 2, 3, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 2, 3, 0],
    [0, 2, 1, 3], [0, 0, 0, 0], [0, 3, 1, 2], [0, 3, 2, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 3, 2, 0],
    [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0],
    [1, 2, 0, 3], [0, 0, 0, 0], [1, 3, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 3, 0, 1], [2, 3, 1, 0],
    [1, 0, 2, 3], [1, 0, 3, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 3, 1], [0, 0, 0, 0], [2, 1, 3, 0],
    [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0],
    [2, 0, 1, 3], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [3, 0, 1, 2], [3, 0, 2, 1], [0, 0, 0, 0], [3, 1, 2, 0],
    [2, 1, 0, 3], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [3, 1, 0, 2], [0, 0, 0, 0], [3, 2, 0, 1], [3, 2, 1, 0]
  ];

  // Mathf.PI / Mathf.PI2（float32 常量，逐字对齐 Java 字面量）
  private static readonly PI = 3.1415927;
  private static readonly PI2 = 3.1415927 * 2;

  //static only
  private constructor(){
  }

  // 2D Multi-octave Simplex noise.
  // For each octave, a higher frequency/lower amplitude function will be added to the original.
  // The higher the persistence [0-1], the more of each succeeding octave will be added.
  static noise2d(seed: number, octaves: number, persistence: number, scale: number, x: number, y: number): number{
    let total = 0;
    let frequency = scale;
    let amplitude = 1;

    // We have to keep track of the largest possible amplitude,
    // because each octave adds more, and we need a value in [-1, 1].
    let maxAmplitude = 0;

    for(let i = 0; i < octaves; i++){
      total += (Simplex.raw2d(seed, x * frequency, y * frequency) + 1) / 2 * amplitude;

      frequency *= 2;
      maxAmplitude += amplitude;
      amplitude *= persistence;
    }

    return total / maxAmplitude;
  }

  // 3D Multi-octave Simplex noise.
  // For each octave, a higher frequency/lower amplitude function will be added to the original.
  // The higher the persistence [0-1], the more of each succeeding octave will be added.
  static noise3d(seed: number, octaves: number, persistence: number, scale: number, x: number, y: number, z: number): number{
    let total = 0;
    let frequency = scale;
    let amplitude = 1;

    let maxAmplitude = 0;

    for(let i = 0; i < octaves; i++){
      total += (Simplex.raw3d(seed, x * frequency, y * frequency, z * frequency) + 1) / 2 * amplitude;

      frequency *= 2;
      maxAmplitude += amplitude;
      amplitude *= persistence;
    }

    return total / maxAmplitude;
  }

  // 4D Multi-octave Simplex noise.
  // For each octave, a higher frequency/lower amplitude function will be added to the original.
  // The higher the persistence [0-1], the more of each succeeding octave will be added.
  static noise4d(octaves: number, persistence: number, scale: number, x: number, y: number, z: number, w: number): number{
    let total = 0;
    let frequency = scale;
    let amplitude = 1;

    let maxAmplitude = 0;

    for(let i = 0; i < octaves; i++){
      total += Simplex.raw4d(x * frequency, y * frequency, z * frequency, w * frequency) * amplitude;

      frequency *= 2;
      maxAmplitude += amplitude;
      amplitude *= persistence;
    }

    return total / maxAmplitude;
  }

  // 2D raw Simplex noise
  static raw2d(seed: number, x: number, y: number): number{
    let n0 = 0, n1 = 0, n2 = 0; // Noise contributions from the three corners

    // Skew the input space to determine which simplex cell we're in
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    // Hairy factor for 2D
    const s = (x + y) * F2;
    const i = Simplex.fastfloor(x + s);
    const j = Simplex.fastfloor(y + s);

    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
    const t = (i + j) * G2;
    // Unskew the cell origin back to (x,y) space
    const X0 = i - t;
    const Y0 = j - t;
    // The x,y distances from the cell origin
    const x0 = x - X0;
    const y0 = y - Y0;

    // For the 2D case, the simplex shape is an equilateral triangle.
    // Determine which simplex we are in.
    let i1: number, j1: number; // Offsets for second (middle) corner of simplex in (i,j) coords
    if(x0 > y0){
      i1 = 1;
      j1 = 0;
    } // lower triangle, XY order: (0,0)->(1,0)->(1,1)
    else{
      i1 = 0;
      j1 = 1;
    } // upper triangle, YX order: (0,0)->(0,1)->(1,1)

    // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
    // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
    // c = (3-sqrt(3))/6
    const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords
    const y2 = y0 - 1.0 + 2.0 * G2;

    // Work out the hashed gradient indices of the three simplex corners
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = Simplex.perm(seed, ii + Simplex.perm(seed, jj)) % 12;
    const gi1 = Simplex.perm(seed, ii + i1 + Simplex.perm(seed, jj + j1)) % 12;
    const gi2 = Simplex.perm(seed, ii + 1 + Simplex.perm(seed, jj + 1)) % 12;

    // Calculate the contribution from the three corners
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if(t0 < 0) n0 = 0.0;
    else{
      t0 *= t0;
      n0 = t0 * t0 * Simplex.dot(Simplex.grad3[gi0], x0, y0); // (x,y) of grad3 used for 2D gradient
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if(t1 < 0) n1 = 0.0;
    else{
      t1 *= t1;
      n1 = t1 * t1 * Simplex.dot(Simplex.grad3[gi1], x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if(t2 < 0) n2 = 0.0;
    else{
      t2 *= t2;
      n2 = t2 * t2 * Simplex.dot(Simplex.grad3[gi2], x2, y2);
    }

    // Add contributions from each corner to get the final noise value.
    // The result is scaled to return values in the interval [-1,1].
    return 70.0 * (n0 + n1 + n2);
  }

  // 3D raw Simplex noise
  static raw3d(seed: number, x: number, y: number, z: number): number{
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0; // Noise contributions from the four corners

    // Skew the input space to determine which simplex cell we're in
    const F3 = 1.0 / 3.0;
    const s = (x + y + z) * F3; // Very nice and simple skew factor for 3D
    const i = Simplex.fastfloor(x + s);
    const j = Simplex.fastfloor(y + s);
    const k = Simplex.fastfloor(z + s);

    const G3 = 1.0 / 6.0; // Very nice and simple unskew factor, too
    const t = (i + j + k) * G3;
    const X0 = i - t; // Unskew the cell origin back to (x,y,z) space
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = x - X0; // The x,y,z distances from the cell origin
    const y0 = y - Y0;
    const z0 = z - Z0;

    // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
    // Determine which simplex we are in.
    let i1: number, j1: number, k1: number; // Offsets for second corner of simplex in (i,j,k) coords
    let i2: number, j2: number, k2: number; // Offsets for third corner of simplex in (i,j,k) coords

    if(x0 >= y0){
      if(y0 >= z0){
        i1 = 1; j1 = 0; k1 = 0;
        i2 = 1; j2 = 1; k2 = 0;
      } // X Y Z order
      else if(x0 >= z0){
        i1 = 1; j1 = 0; k1 = 0;
        i2 = 1; j2 = 0; k2 = 1;
      } // X Z Y order
      else{
        i1 = 0; j1 = 0; k1 = 1;
        i2 = 1; j2 = 0; k2 = 1;
      } // Z X Y order
    }else{ // x0<y0
      if(y0 < z0){
        i1 = 0; j1 = 0; k1 = 1;
        i2 = 0; j2 = 1; k2 = 1;
      } // Z Y X order
      else if(x0 < z0){
        i1 = 0; j1 = 1; k1 = 0;
        i2 = 0; j2 = 1; k2 = 1;
      } // Y Z X order
      else{
        i1 = 0; j1 = 1; k1 = 0;
        i2 = 1; j2 = 1; k2 = 0;
      } // Y X Z order
    }

    // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
    // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
    // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
    // c = 1/6.
    const x1 = x0 - i1 + G3; // Offsets for second corner in (x,y,z) coords
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner in (x,y,z) coords
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3; // Offsets for last corner in (x,y,z) coords
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    // Work out the hashed gradient indices of the four simplex corners
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const gi0 = Simplex.perm(seed, ii + Simplex.perm(seed, jj + Simplex.perm(seed, kk))) % 12;
    const gi1 = Simplex.perm(seed, ii + i1 + Simplex.perm(seed, jj + j1 + Simplex.perm(seed, kk + k1))) % 12;
    const gi2 = Simplex.perm(seed, ii + i2 + Simplex.perm(seed, jj + j2 + Simplex.perm(seed, kk + k2))) % 12;
    const gi3 = Simplex.perm(seed, ii + 1 + Simplex.perm(seed, jj + 1 + Simplex.perm(seed, kk + 1))) % 12;

    // Calculate the contribution from the four corners
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if(t0 < 0) n0 = 0.0;
    else{
      t0 *= t0;
      n0 = t0 * t0 * Simplex.dot(Simplex.grad3[gi0], x0, y0, z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if(t1 < 0) n1 = 0.0;
    else{
      t1 *= t1;
      n1 = t1 * t1 * Simplex.dot(Simplex.grad3[gi1], x1, y1, z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if(t2 < 0) n2 = 0.0;
    else{
      t2 *= t2;
      n2 = t2 * t2 * Simplex.dot(Simplex.grad3[gi2], x2, y2, z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if(t3 < 0) n3 = 0.0;
    else{
      t3 *= t3;
      n3 = t3 * t3 * Simplex.dot(Simplex.grad3[gi3], x3, y3, z3);
    }

    // Add contributions from each corner to get the final noise value.
    // The result is scaled to stay just inside [-1,1]
    return 32.0 * (n0 + n1 + n2 + n3);
  }

  // 4D raw Simplex noise
  static raw4d(x: number, y: number, z: number, w: number): number{
    // The skewing and unskewing factors are hairy again for the 4D case
    const F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
    const G4 = (5.0 - Math.sqrt(5.0)) / 20.0;
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0, n4 = 0; // Noise contributions from the five corners

    // Skew the (x,y,z,w) space to determine which cell of 24 simplices we're in
    const s = (x + y + z + w) * F4; // Factor for 4D skewing
    const i = Simplex.fastfloor(x + s);
    const j = Simplex.fastfloor(y + s);
    const k = Simplex.fastfloor(z + s);
    const l = Simplex.fastfloor(w + s);
    const t = (i + j + k + l) * G4; // Factor for 4D unskewing
    const X0 = i - t; // Unskew the cell origin back to (x,y,z,w) space
    const Y0 = j - t;
    const Z0 = k - t;
    const W0 = l - t;

    const x0 = x - X0; // The x,y,z,w distances from the cell origin
    const y0 = y - Y0;
    const z0 = z - Z0;
    const w0 = w - W0;

    // For the 4D case, the simplex is a 4D shape I won't even try to describe.
    // To find out which of the 24 possible simplices we're in, we need to
    // determine the magnitude ordering of x0, y0, z0 and w0.
    // The method below is a good way of finding the ordering of x,y,z,w and
    // then find the correct traversal order for the simplex we're in.
    // First, six pair-wise comparisons are performed between each possible pair
    // of the four coordinates, and the results are used to add up binary bits
    // for an integer index.
    const c1 = (x0 > y0) ? 32 : 0;
    const c2 = (x0 > z0) ? 16 : 0;
    const c3 = (y0 > z0) ? 8 : 0;
    const c4 = (x0 > w0) ? 4 : 0;
    const c5 = (y0 > w0) ? 2 : 0;
    const c6 = (z0 > w0) ? 1 : 0;
    const c = c1 + c2 + c3 + c4 + c5 + c6;

    let i1: number, j1: number, k1: number, l1: number; // The integer offsets for the second simplex corner
    let i2: number, j2: number, k2: number, l2: number; // The integer offsets for the third simplex corner
    let i3: number, j3: number, k3: number, l3: number; // The integer offsets for the fourth simplex corner

    // simplex[c] is a 4-vector with the numbers 0, 1, 2 and 3 in some order.
    // Many values of c will never occur, since e.g. x>y>z>w makes x<z, y<w and x<w
    // impossible. Only the 24 indices which have non-zero entries make any sense.
    // We use a thresholding to set the coordinates in turn from the largest magnitude.
    // The number 3 in the "simplex" array is at the position of the largest coordinate.
    i1 = Simplex.simplex[c][0] >= 3 ? 1 : 0;
    j1 = Simplex.simplex[c][1] >= 3 ? 1 : 0;
    k1 = Simplex.simplex[c][2] >= 3 ? 1 : 0;
    l1 = Simplex.simplex[c][3] >= 3 ? 1 : 0;
    // The number 2 in the "simplex" array is at the second largest coordinate.
    i2 = Simplex.simplex[c][0] >= 2 ? 1 : 0;
    j2 = Simplex.simplex[c][1] >= 2 ? 1 : 0;
    k2 = Simplex.simplex[c][2] >= 2 ? 1 : 0;
    l2 = Simplex.simplex[c][3] >= 2 ? 1 : 0;
    // The number 1 in the "simplex" array is at the second smallest coordinate.
    i3 = Simplex.simplex[c][0] >= 1 ? 1 : 0;
    j3 = Simplex.simplex[c][1] >= 1 ? 1 : 0;
    k3 = Simplex.simplex[c][2] >= 1 ? 1 : 0;
    l3 = Simplex.simplex[c][3] >= 1 ? 1 : 0;
    // The fifth corner has all coordinate offsets = 1, so no need to look that up.

    const x1 = x0 - i1 + G4; // Offsets for second corner in (x,y,z,w) coords
    const y1 = y0 - j1 + G4;
    const z1 = z0 - k1 + G4;
    const w1 = w0 - l1 + G4;
    const x2 = x0 - i2 + 2.0 * G4; // Offsets for third corner in (x,y,z,w) coords
    const y2 = y0 - j2 + 2.0 * G4;
    const z2 = z0 - k2 + 2.0 * G4;
    const w2 = w0 - l2 + 2.0 * G4;
    const x3 = x0 - i3 + 3.0 * G4; // Offsets for fourth corner in (x,y,z,w) coords
    const y3 = y0 - j3 + 3.0 * G4;
    const z3 = z0 - k3 + 3.0 * G4;
    const w3 = w0 - l3 + 3.0 * G4;
    const x4 = x0 - 1.0 + 4.0 * G4; // Offsets for last corner in (x,y,z,w) coords
    const y4 = y0 - 1.0 + 4.0 * G4;
    const z4 = z0 - 1.0 + 4.0 * G4;
    const w4 = w0 - 1.0 + 4.0 * G4;

    // Work out the hashed gradient indices of the five simplex corners
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const ll = l & 255;
    const gi0 = (ii + (jj + (kk + (ll)))) % 32;
    const gi1 = (ii + i1 + (jj + j1 + (kk + k1 + (ll + l1)))) % 32;
    const gi2 = (ii + i2 + (jj + j2 + (kk + k2 + (ll + l2)))) % 32;
    const gi3 = (ii + i3 + (jj + j3 + (kk + k3 + (ll + l3)))) % 32;
    const gi4 = (ii + 1 + (jj + 1 + (kk + 1 + (ll + 1)))) % 32;

    // Calculate the contribution from the five corners
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
    if(t0 < 0) n0 = 0.0;
    else{
      t0 *= t0;
      n0 = t0 * t0 * Simplex.dot(Simplex.grad4[gi0], x0, y0, z0, w0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
    if(t1 < 0) n1 = 0.0;
    else{
      t1 *= t1;
      n1 = t1 * t1 * Simplex.dot(Simplex.grad4[gi1], x1, y1, z1, w1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
    if(t2 < 0) n2 = 0.0;
    else{
      t2 *= t2;
      n2 = t2 * t2 * Simplex.dot(Simplex.grad4[gi2], x2, y2, z2, w2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
    if(t3 < 0) n3 = 0.0;
    else{
      t3 *= t3;
      n3 = t3 * t3 * Simplex.dot(Simplex.grad4[gi3], x3, y3, z3, w3);
    }

    let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
    if(t4 < 0) n4 = 0.0;
    else{
      t4 *= t4;
      n4 = t4 * t4 * Simplex.dot(Simplex.grad4[gi4], x4, y4, z4, w4);
    }

    // Sum up and scale the result to cover the range [-1,1]
    return 27.0 * (n0 + n1 + n2 + n3 + n4);
  }

  static rawTiled(x: number, y: number, x1: number, y1: number, w: number, h: number, scl: number): number{
    x /= scl;
    y /= scl;
    w /= scl;
    h /= scl;

    const x2 = x1 + w, y2 = y1 + h;

    const s = x / w, t = y / h;
    const dx = x2 - x1, dy = y2 - y1;

    const nx = x1 + Math.cos(s * 2 * Simplex.PI) * dx / Simplex.PI2;
    const ny = y1 + Math.cos(t * 2 * Simplex.PI) * dy / Simplex.PI2;
    const nz = x1 + Math.sin(s * 2 * Simplex.PI) * dx / Simplex.PI2;
    const nw = y1 + Math.sin(t * 2 * Simplex.PI) * dy / Simplex.PI2;

    return Simplex.raw4d(nx, ny, nz, nw);
  }

  //hash function: seed (any) + x (will be masked to fit in 0-255) -> 0-255
  //thanks to TEttinger on Discord for the negative coordinate discontinuity fix
  static perm(seed: number, x: number): number{
    // Java int 语义：Math.imul 复现 32 位乘法溢出
    x = Math.imul(x & 255, 0x45d9f3b);
    x = Math.imul((x >>> 16) ^ x, (0x45d9f3b + seed) | 0);
    x = (x >>> 16) ^ x;
    return x & 0xff;
  }

  static fastfloor(x: number): number{
    return x > 0 ? Math.trunc(x) : Math.trunc(x) - 1;
  }

  static dot(g: number[], x: number, y: number): number;
  static dot(g: number[], x: number, y: number, z: number): number;
  static dot(g: number[], x: number, y: number, z: number, w: number): number;
  static dot(g: number[], x: number, y: number, z?: number, w?: number): number{
    if(z === undefined) return g[0] * x + g[1] * y;
    if(w === undefined) return g[0] * x + g[1] * y + g[2] * z;
    return g[0] * x + g[1] * y + g[2] * z + g[3] * w;
  }
}

