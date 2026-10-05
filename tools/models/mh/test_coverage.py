import unittest
import numpy as np
from coverage import under_cloth


class CoverageTest(unittest.TestCase):
    def test_quitar_remera_no_borra_pecho_ni_brazos(self):
        # El asset conserva los vértices de la remera, pero exporta solo el pantalón.
        garment = np.array([[0., 0., 0.], [1., 0., 0.], [1., 0., 1.], [0., 0., 1.],
                            [0.5, 1., 0.5], [-0.5, 1., 0.5]])
        body = np.array([[0.5, 1., 0.5], [-0.5, 1., 0.5], [0.02, 0.02, 0.02]])
        result = under_cloth(body, garment, [[0, 1, 2, 3]], np.zeros(3, bool))
        self.assertEqual(result.tolist(), [False, False, True])

    def test_prenda_vacia_no_tapa_piel(self):
        p = np.array([[0., 0., 0.]])
        self.assertEqual(under_cloth(p, p, [], np.zeros(1, bool)).tolist(), [False])

    def test_cuello_protegido_y_piel_lejana_se_conservan(self):
        g = np.array([[0., 0., 0.], [1., 0., 0.], [1., 0., 1.], [0., 0., 1.]])
        p = np.array([[0.02, 0.02, 0.02], [0.5, 2., 0.5]])
        self.assertEqual(under_cloth(p, g, [[0, 1, 2, 3]], np.array([True, False])).tolist(), [False, False])


if __name__ == '__main__':
    unittest.main()
