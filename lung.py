class LungBlock:
    def __init__(self):
        self.efficiency = 0.95

    def process(self, Q_in, O2_in):
        O2_out = O2_in + (0.98 - O2_in) * self.efficiency
        return Q_in, O2_out