import math

class LeftVentricle:
    def __init__(self, HR=75):
        self.V = max(60.0, 20)
        self.P = 5.0

        self.R = 0.6
        self.HR = HR
        self.phi = 0.7

        self.E_min = 0.05
        self.E_max = 2.5
        self.V0 = 10.0

    def activation(self, t):
        omega = 2 * math.pi * (self.HR / 60)
        x = (math.sin(omega * t - self.phi) + 1) / 2
        return x ** 3

    def elastance(self, t):
        A = self.activation(t)
        return self.E_min + (self.E_max - self.E_min) * A

    def update(self, dt, t, Q_in, P_body):
        E_t = self.elastance(t)
        self.P = E_t * (self.V - self.V0)

        deltaP = self.P - P_body
        Q_out = (deltaP / self.R) if deltaP > 0 else 0.0
        Q_out = min(Q_out, self.V / dt) 

        self.V += (Q_in - Q_out) * dt
        self.V = max(self.V, self.V0 + 5)

        return Q_out, self.P