# La piel solo puede quedar tapada por caras de ropa que se vayan a exportar.
# Los vértices de una remera quitada siguen en el asset, pero no son una prenda.
import numpy as np


def under_cloth(body, garment, faces, protected):
    hidden = np.zeros(len(body), bool)
    if not faces:
        return hidden
    used = np.unique(np.concatenate(faces))
    normals = np.zeros_like(garment)
    for f in faces:
        n = np.cross(garment[f[1]] - garment[f[0]], garment[f[-1]] - garment[f[0]])
        normals[f] += n
    normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-9
    # También se recorta la búsqueda del vecino más cercano: un vértice sin caras
    # tiene normal cero y antes se interpretaba como tela encima de la piel.
    garment = garment[used]
    normals = normals[used]
    for i in range(0, len(body), 256):
        points = body[i:i + 256]
        distances = np.linalg.norm(points[:, None, :] - garment[None, :, :], axis=2)
        nearest = distances.argmin(1)
        under = ((points - garment[nearest]) * normals[nearest]).sum(1) < 0.03
        hidden[i:i + len(points)] = (distances[np.arange(len(points)), nearest] < 0.18) & under & ~protected[i:i + len(points)]
    return hidden
