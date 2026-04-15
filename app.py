import json
import time
import threading
from flask import Flask, render_template
from flask_sock import Sock


from ra import RightAtrium
from rv import RightVentricle
from lung import LungBlock
from la import LeftAtrium
from lv import LeftVentricle

app = Flask(__name__, template_folder='templates', static_folder='static')
sock = Sock(app)

clients = set()

# Initialize components
ra = RightAtrium()
rv = RightVentricle()
lung = LungBlock()
la = LeftAtrium()
lv = LeftVentricle()

# Simulation state
simulation_state = {
    "t": 0.0,
    "dt": 0.1,
    "HR": 75,
    "Q_in_RA": 8.0,
    "O2_in": 0.6,
    "P_body": 10,
    "P_lung": 10,
    "lung_efficiency": 0.95,
}

# 🔥 PARAM MAPPING (k1/k2 → max/min)
param_map = {
    "k1": "E_max",
    "k2": "E_min"
}

def map_param(param):
    return param_map.get(param, param)

def sync_hr():
    ra.HR = simulation_state["HR"]
    rv.HR = simulation_state["HR"]
    la.HR = simulation_state["HR"]
    lv.HR = simulation_state["HR"]

def background_simulation():
    while True:
        try:
            t = simulation_state["t"]
            dt = simulation_state["dt"]

            sync_hr()

            Q_in_RA = simulation_state["Q_in_RA"]
            O2_in = simulation_state["O2_in"]
            P_body = simulation_state["P_body"]
            P_lung = simulation_state["P_lung"]

            # --- Right side ---
            Q_RA_RV, P_RA = ra.update(dt, t, Q_in_RA, rv.P)
            Q_RV_out, P_RV = rv.update(dt, t, Q_RA_RV, P_lung)

            # --- Lung ---
            lung.efficiency = simulation_state["lung_efficiency"]
            Q_lung, O2_out = lung.process(Q_RV_out, O2_in)

            # --- Left side ---
            Q_LA_LV, P_LA, _ = la.update(dt, t, Q_lung, lv.P, O2_out)
            Q_LV_out, P_LV = lv.update(dt, t, Q_LA_LV, P_body)

            # 🔥 No fake minimum flow
            Q_LV_out = max(Q_LV_out, 0.0)

            # Gentle pressure sanity
            if P_LA > P_LV:
                P_LA = P_LV - 0.5

            if P_RA > P_RV:
                P_RA = P_RV - 0.5

            simulation_state["t"] += dt

            O2_delivery = Q_LV_out * O2_out

            output_payload = {
                "t": simulation_state["t"],
                "flow": Q_LV_out,
                "O2_delivery": O2_delivery,

                "ra": {
                    "V": ra.V,
                    "P": P_RA,
                    "Q_out": Q_RA_RV,
                    "A": ra.activation(t)
                },
                "rv": {
                    "V": rv.V,
                    "P": P_RV,
                    "Q_out": Q_RV_out,
                    "A": rv.activation(t)
                },
                "la": {
                    "V": la.V,
                    "P": P_LA,
                    "Q_out": Q_LA_LV,
                    "A": la.activation(t)
                },
                "lv": {
                    "V": lv.V,
                    "P": P_LV,
                    "Q_out": Q_LV_out,
                    "A": lv.activation(t)
                },
                "lung": {
                    "O2_out": O2_out
                },
                "params": simulation_state
            }

            payload_str = json.dumps(output_payload)

            dead_clients = set()
            for client in clients.copy():
                try:
                    client.send(payload_str)
                except:
                    dead_clients.add(client)

            for dc in dead_clients:
                clients.discard(dc)

            time.sleep(dt)

        except Exception as e:
            print(f"Simulation Error: {e}")
            time.sleep(1)

# Start simulation thread
threading.Thread(target=background_simulation, daemon=True).start()

# Routes
@app.route('/')
def route_full():
    return render_template('full_heart.html', title='Global Overview', chamber_key='full')

@app.route('/ra')
def route_ra():
    return render_template('chamber.html', title='Right Atrium', chamber_key='ra')

@app.route('/rv')
def route_rv():
    return render_template('chamber.html', title='Right Ventricle', chamber_key='rv')

@app.route('/la')
def route_la():
    return render_template('chamber.html', title='Left Atrium', chamber_key='la')

@app.route('/lv')
def route_lv():
    return render_template('chamber.html', title='Left Ventricle', chamber_key='lv')

# WebSocket
@sock.route('/ws')
def websocket_endpoint(ws):
    clients.add(ws)
    try:
        while True:
            data = ws.receive()
            if data is None:
                break

            message = json.loads(data)

            param = map_param(message.get("param"))
            val = float(message.get("value"))

            if "chamber" in message and message["chamber"]:
                chamber = message["chamber"]

                if chamber == 'ra':
                    setattr(ra, param, val)
                elif chamber == 'rv':
                    setattr(rv, param, val)
                elif chamber == 'la':
                    setattr(la, param, val)
                elif chamber == 'lv':
                    setattr(lv, param, val)
            else:
                simulation_state[param] = val

    finally:
        clients.discard(ws)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, threaded=True)