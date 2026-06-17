function normalModesChain(masses, springs) {
  // masses = [m1, m2, ..., mn]
  // springs = [k1, k2, ..., k(n+1)]
  //
  // Represents:
  // wall -- k1 -- m1 -- k2 -- m2 -- ... -- mn -- k(n+1) -- wall

  var n = masses.length;

  if (springs.length !== n + 1) {
    throw new Error("For n masses, expected n + 1 springs.");
  }

  for (var i = 0; i < n; i++) {
    if (masses[i] <= 0) {
      throw new Error("Masses must be positive.");
    }
  }

  for (var j = 0; j < springs.length; j++) {
    if (springs[j] < 0) {
      throw new Error("Spring constants must be non-negative.");
    }
  }

  // Build stiffness matrix K
  var K = [];

  for (var r = 0; r < n; r++) {
    K[r] = [];
    for (var c = 0; c < n; c++) {
      K[r][c] = 0;
    }
  }

  for (var i2 = 0; i2 < n; i2++) {
    K[i2][i2] = springs[i2] + springs[i2 + 1];

    if (i2 > 0) {
      K[i2][i2 - 1] = -springs[i2];
    }

    if (i2 < n - 1) {
      K[i2][i2 + 1] = -springs[i2 + 1];
    }
  }

  // Convert generalized eigenproblem:
  //
  // K phi = lambda M phi
  //
  // into ordinary symmetric eigenproblem:
  //
  // A q = lambda q
  //
  // where:
  //
  // A = M^(-1/2) K M^(-1/2)
  //
  // and:
  //
  // phi = M^(-1/2) q

  var A = [];

  for (var r2 = 0; r2 < n; r2++) {
    A[r2] = [];
    for (var c2 = 0; c2 < n; c2++) {
      A[r2][c2] = K[r2][c2] / Math.sqrt(masses[r2] * masses[c2]);
    }
  }

  var eig = jacobiEigenDecompositionSymmetric(A);

  var modes = [];

  for (var modeIndex = 0; modeIndex < n; modeIndex++) {
    var lambda = eig.values[modeIndex];

    if (Math.abs(lambda) < 1e-10) {
      lambda = 0;
    }

    if (lambda < 0) {
      throw new Error("Negative eigenvalue found. Check stiffness and mass values.");
    }

    var omega = Math.sqrt(lambda);
    var hz = omega / (2 * Math.PI);

    var q = eig.vectors[modeIndex];

    // Convert q back to physical displacement mode shape phi
    var phi = [];

    for (var p = 0; p < n; p++) {
      phi[p] = q[p] / Math.sqrt(masses[p]);
    }

    // Mass-normalize the mode:
    //
    // phi^T M phi = 1
    //
    var modalMass = 0;

    for (var p2 = 0; p2 < n; p2++) {
      modalMass += masses[p2] * phi[p2] * phi[p2];
    }

    var scale = Math.sqrt(modalMass);

    for (var p3 = 0; p3 < n; p3++) {
      phi[p3] = phi[p3] / scale;
    }

    // Make sign consistent: largest component is positive
    phi = makeLargestComponentPositive(phi);

    // Also create a display-friendly mode shape where largest component = 1
    var displayShape = normalizeLargestToOne(phi);

    modes.push({
      mode: modeIndex + 1,
      lambda: lambda,
      omega: omega,
      hz: hz,
      massNormalizedShape: phi,
      displayShape: displayShape
    });
  }

  return {
    stiffnessMatrix: K,
    modes: modes
  };
}

function jacobiEigenDecompositionSymmetric(inputMatrix) {
  var n = inputMatrix.length;

  var A = [];
  var V = [];

  for (var i = 0; i < n; i++) {
    A[i] = inputMatrix[i].slice();

    V[i] = [];
    for (var j = 0; j < n; j++) {
      V[i][j] = i === j ? 1 : 0;
    }
  }

  var maxIterations = 100 * n * n;
  var tolerance = 1e-12;

  for (var iter = 0; iter < maxIterations; iter++) {
    var p = 0;
    var q = 1;
    var maxOffDiagonal = 0;

    for (var r = 0; r < n; r++) {
      for (var c = r + 1; c < n; c++) {
        var value = Math.abs(A[r][c]);
        if (value > maxOffDiagonal) {
          maxOffDiagonal = value;
          p = r;
          q = c;
        }
      }
    }

    if (maxOffDiagonal < tolerance) {
      break;
    }

    var app = A[p][p];
    var aqq = A[q][q];
    var apq = A[p][q];

    var tau = (aqq - app) / (2 * apq);
    var t;

    if (tau >= 0) {
      t = 1 / (tau + Math.sqrt(1 + tau * tau));
    } else {
      t = -1 / (-tau + Math.sqrt(1 + tau * tau));
    }

    var cos = 1 / Math.sqrt(1 + t * t);
    var sin = t * cos;

    for (var i2 = 0; i2 < n; i2++) {
      if (i2 !== p && i2 !== q) {
        var aip = A[i2][p];
        var aiq = A[i2][q];

        A[i2][p] = cos * aip - sin * aiq;
        A[p][i2] = A[i2][p];

        A[i2][q] = sin * aip + cos * aiq;
        A[q][i2] = A[i2][q];
      }
    }

    A[p][p] = cos * cos * app - 2 * sin * cos * apq + sin * sin * aqq;
    A[q][q] = sin * sin * app + 2 * sin * cos * apq + cos * cos * aqq;

    A[p][q] = 0;
    A[q][p] = 0;

    // Update eigenvector matrix
    for (var i3 = 0; i3 < n; i3++) {
      var vip = V[i3][p];
      var viq = V[i3][q];

      V[i3][p] = cos * vip - sin * viq;
      V[i3][q] = sin * vip + cos * viq;
    }
  }

  var pairs = [];

  for (var d = 0; d < n; d++) {
    var vector = [];

    for (var r2 = 0; r2 < n; r2++) {
      vector.push(V[r2][d]);
    }

    pairs.push({
      value: A[d][d],
      vector: vector
    });
  }

  pairs.sort(function(a, b) {
    return a.value - b.value;
  });

  return {
    values: pairs.map(function(pair) {
      return pair.value;
    }),
    vectors: pairs.map(function(pair) {
      return pair.vector;
    })
  };
}

function makeLargestComponentPositive(vec) {
  var maxIndex = 0;
  var maxValue = 0;

  for (var i = 0; i < vec.length; i++) {
    if (Math.abs(vec[i]) > maxValue) {
      maxValue = Math.abs(vec[i]);
      maxIndex = i;
    }
  }

  if (vec[maxIndex] < 0) {
    return vec.map(function(x) {
      return -x;
    });
  }

  return vec.slice();
}

function normalizeLargestToOne(vec) {
  var maxIndex = 0;
  var maxValue = 0;

  for (var i = 0; i < vec.length; i++) {
    if (Math.abs(vec[i]) > maxValue) {
      maxValue = Math.abs(vec[i]);
      maxIndex = i;
    }
  }

  if (maxValue === 0) {
    return vec.slice();
  }

  var scale = vec[maxIndex];

  return vec.map(function(x) {
    return x / scale;
  });
}

var result = normalModesChain(
  [1.0, 2.0, 1.5, 1.0],             // masses
  [100.0, 50.0, 80.0, 60.0, 100.0]  // springs
);

console.log(result.modes);
