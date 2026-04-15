from ra import RightAtrium
from rv import RightVentricle
from lung import LungBlock
from la import LeftAtrium
from lv import LeftVentricle
import matplotlib.pyplot as plt
ra = RightAtrium()
rv = RightVentricle()
lung = LungBlock()
la = LeftAtrium()
lv = LeftVentricle()

t = 0
dt = 0.05

Q_in_RA = 25.0
O2 = 0.65
P_body = 80
P_lung = 8
time_hist = []
lv_pressure_hist = []
lv_volume_hist = []
flow_hist = []
for step in range(2000):
    t += dt

    Q_RA_RV, P_RA = ra.update(dt, t, Q_in_RA, rv.P)
    Q_RV_LUNG, P_RV = rv.update(dt, t, Q_RA_RV, P_lung)

    Q_LUNG_LA, O2 = lung.process(Q_RV_LUNG, O2)

    Q_LA_LV, P_LA, O2 = la.update(dt, t, Q_LUNG_LA, lv.P, O2)
    Q_LV_BODY, P_LV = lv.update(dt, t, Q_LA_LV, P_body)

    O2_delivery = Q_LV_BODY * O2
    time_hist.append(t)
    lv_pressure_hist.append(P_LV)
    lv_volume_hist.append(lv.V)
    flow_hist.append(Q_LV_BODY)
    Q_in_RA = Q_LV_BODY

    if step % 20 == 0:
        print("\n--- TIME:", round(t, 2), "---")
        print(f"Flow: {Q_LV_BODY:.2f} mL/s | LV Pressure: {P_LV:.2f} mmHg | O2: {O2*100:.1f}%")
        print(f"O2 delivery: {O2_delivery:.2f}")

        print(f"RA→RV: {Q_RA_RV:.2f}")
        print(f"RV→LUNG: {Q_RV_LUNG:.2f}")
        print(f"LUNG→LA: {Q_LUNG_LA:.2f}")
        print(f"LA→LV: {Q_LA_LV:.2f}")

        print(f"P_RA: {P_RA:.2f} | P_RV: {P_RV:.2f}")
        print(f"P_LA: {P_LA:.2f} | P_LV: {P_LV:.2f}")
        
print("\n====== ANALYSIS ======")

# Pressure stats
max_P = max(lv_pressure_hist)
min_P = min(lv_pressure_hist)
mean_P = sum(lv_pressure_hist) / len(lv_pressure_hist)

print(f"LV Peak Pressure: {max_P:.2f} mmHg")
print(f"LV Min Pressure: {min_P:.2f} mmHg")
print(f"LV Mean Pressure: {mean_P:.2f} mmHg")
print(f"P_LA={P_LA:.2f}, P_LV={P_LV:.2f}, LA→LV={Q_LA_LV:.2f}")

# Stroke Volume
SV = max(lv_volume_hist) - min(lv_volume_hist)
print(f"Stroke Volume: {SV:.2f} mL")

# Cardiac Output
HR = 75  # or use your variable
CO = SV * HR / 1000  # L/min
print(f"Cardiac Output: {CO:.2f} L/min")

# -------- PLOTS --------

plt.figure(figsize=(10,5))

# LV Pressure
plt.subplot(2,1,1)
plt.plot(time_hist, lv_pressure_hist)
plt.title("LV Pressure vs Time")
plt.ylabel("Pressure (mmHg)")

# Flow
plt.subplot(2,1,2)
plt.plot(time_hist, flow_hist)
plt.title("Flow vs Time")
plt.xlabel("Time (s)")
plt.ylabel("Flow (mL/s)")

plt.tight_layout()
plt.show()

