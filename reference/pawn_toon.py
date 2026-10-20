"""Rebuild 'Pawn Toon.html' (three.js) in Blender and render it.

Run:  blender -b -P pawn_toon.py -- <out_dir>
three.js is Y-up; Blender is Z-up, so (x, y, z)_three -> (x, -z, y)_blender.
"""
import bpy, bmesh, math, os, sys
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.getcwd()

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scn = bpy.context.scene


# ---------- geometry helpers ----------
def catmull(pts, n):
    """three.js SplineCurve: uniform Catmull-Rom, n+1 samples."""
    out, L = [], len(pts) - 1
    for i in range(n + 1):
        p = L * i / n
        k = int(p)
        w = p - k
        if k >= L:
            k, w = L - 1, 1.0
        P = [pts[max(k - 1, 0)], pts[k], pts[min(k + 1, L)], pts[min(k + 2, L)]]

        def cr(a, b, c, d):
            v0, v1 = (c - a) * 0.5, (d - b) * 0.5
            return (2 * b - 2 * c + v0 + v1) * w ** 3 + (-3 * b + 3 * c - 2 * v0 - v1) * w * w + v0 * w + b

        out.append((cr(*[q[0] for q in P]), cr(*[q[1] for q in P])))
    return out


def lathe_mesh(name, line, seg=128):
    bm = bmesh.new()
    rings = []
    for r, h in line:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / seg), r * math.sin(2 * math.pi * j / seg), h))
                      for j in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for j in range(seg):
            j2 = (j + 1) % seg
            try:
                bm.faces.new((a[j], a[j2], b[j2], b[j]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    return me


def prism(name, poly, a, b, axis="Z"):
    bm = bmesh.new()
    if axis == "Z":
        lo = [bm.verts.new((x, y, a)) for x, y in poly]
        hi = [bm.verts.new((x, y, b)) for x, y in poly]
    else:  # profile in XZ, extruded along Y
        lo = [bm.verts.new((x, a, y)) for x, y in poly]
        hi = [bm.verts.new((x, b, y)) for x, y in poly]
    bm.faces.new(lo)
    bm.faces.new(hi)
    for i in range(len(poly)):
        j = (i + 1) % len(poly)
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def sphere(name, r, c):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=r, matrix=Matrix.Translation(c))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    return me


def box(name, s, c=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*s, 1)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


# ---------- piece profiles (radius, height), straight from the HTML ----------
BASE = [(0, 0), (0.98, 0), (1.02, 0.04), (1.02, 0.12), (0.96, 0.16), (0.92, 0.18), (0.95, 0.22), (0.93, 0.28),
        (0.85, 0.36), (0.72, 0.48)]


def lathe(p, tail=()):
    line = catmull(p, 300) + list(tail)
    line[-1] = (0, line[-1][1])
    return line


prof = BASE + [(0.58, 0.6), (0.48, 0.72), (0.4, 0.9), (0.34, 1.15), (0.3, 1.45), (0.28, 1.75), (0.28, 1.95),
               (0.34, 2.0), (0.58, 2.04), (0.62, 2.09), (0.58, 2.15), (0.34, 2.18), (0.26, 2.22), (0.24, 2.28)]
R = 0.55
C = 2.28 + math.sqrt(R * R - 0.24 ** 2)
t0 = math.asin((2.28 - C) / R)
for i in range(1, 41):
    t = t0 + (math.pi / 2 - t0) * i / 40
    prof.append((max(0, R * math.cos(t)), C + R * math.sin(t)))
pawn_line = catmull(prof, 400)
pawn_line[-1] = (0, pawn_line[-1][1])

PIECES = {"P": [lathe_mesh("pawn", pawn_line)]}

rook = [lathe_mesh("rook", lathe(BASE + [(0.62, 0.58), (0.56, 0.72), (0.5, 1.05), (0.46, 1.5), (0.45, 2.0),
                                        (0.46, 2.4), (0.56, 2.45), (0.74, 2.49), (0.78, 2.56), (0.74, 2.63),
                                        (0.56, 2.66), (0.5, 2.72), (0.52, 2.88), (0.58, 3.02), (0.62, 3.2)],
                                 [(0.62, 3.42), (0.42, 3.42), (0.42, 3.34), (0, 3.34)]))]
for i in range(4):
    span = (math.pi / 2) * 0.6
    a0 = i * math.pi / 2 - span / 2
    a1 = a0 + span
    outer = [(0.62 * math.cos(a0 + (a1 - a0) * k / 24), 0.62 * math.sin(a0 + (a1 - a0) * k / 24)) for k in range(25)]
    inner = [(0.42 * math.cos(a1 - (a1 - a0) * k / 24), 0.42 * math.sin(a1 - (a1 - a0) * k / 24)) for k in range(25)]
    rook.append(prism("merlon", outer + inner, 3.44, 3.68))
PIECES["R"] = rook

PIECES["B"] = [lathe_mesh("bishop", lathe(BASE + [
    (0.6, 0.6), (0.5, 0.78), (0.42, 1.1), (0.37, 1.5), (0.35, 1.9), (0.36, 2.15), (0.46, 2.2), (0.62, 2.24),
    (0.65, 2.3), (0.62, 2.36), (0.44, 2.39), (0.32, 2.44), (0.36, 2.52), (0.44, 2.66), (0.46, 2.82), (0.42, 2.98),
    (0.32, 3.14), (0.18, 3.26), (0.1, 3.3), (0.12, 3.34), (0.13, 3.42), (0.1, 3.5), (0.05, 3.56), (0, 3.58)]))]

queen = [lathe_mesh("queen", lathe(BASE + [
    (0.62, 0.6), (0.52, 0.8), (0.44, 1.2), (0.38, 1.7), (0.35, 2.2), (0.36, 2.6), (0.48, 2.65), (0.66, 2.7),
    (0.7, 2.77), (0.66, 2.84), (0.46, 2.88), (0.36, 2.94), (0.38, 3.1), (0.46, 3.3), (0.58, 3.5), (0.62, 3.58)],
    [(0.6, 3.62), (0.46, 3.62), (0.4, 3.66), (0.3, 3.74), (0.16, 3.79), (0, 3.8)]))]
queen += [sphere("bead", 0.08, (math.cos(i * math.pi / 4) * 0.56, math.sin(i * math.pi / 4) * 0.56, 3.66))
          for i in range(8)]
queen.append(sphere("qball", 0.2, (0, 0, 3.96)))
PIECES["Q"] = queen

PIECES["K"] = [lathe_mesh("king", lathe(BASE + [
    (0.62, 0.6), (0.53, 0.8), (0.46, 1.2), (0.4, 1.8), (0.37, 2.3), (0.38, 2.7), (0.5, 2.75), (0.7, 2.8),
    (0.74, 2.87), (0.7, 2.94), (0.48, 2.98), (0.38, 3.04), (0.42, 3.2), (0.52, 3.42), (0.58, 3.6), (0.58, 3.66)],
    [(0.5, 3.7), (0.36, 3.76), (0.2, 3.8), (0, 3.82)])),
    box("crossV", (0.17, 0.17, 0.8), (0, 0, 4.22)), box("crossH", (0.5, 0.17, 0.17), (0, 0, 4.34))]

head = [(-0.55, 0), (0.55, 0), (0.5, 0.4), (0.38, 0.8), (0.45, 1.1), (0.72, 1.48), (0.95, 1.72), (1.0, 1.92),
        (0.86, 2.08), (0.5, 2.28), (0.3, 2.48), (0.2, 2.66), (0.06, 2.52), (-0.12, 2.58), (-0.24, 2.4),
        (-0.5, 2.05), (-0.62, 1.5), (-0.6, 0.9), (-0.55, 0.4)]
knight_head = prism("knighthead", [(x, y + 0.74) for x, y in head], -0.28, 0.28, axis="Y")
knight_head.transform(Matrix.Rotation(math.pi / 2, 4, "Z"))
PIECES["N"] = [lathe_mesh("knightbase", lathe(BASE + [(0.64, 0.58), (0.6, 0.66), (0.62, 0.74)],
                                              [(0.5, 0.8), (0, 0.8)])), knight_head]
BEVELED = ("merlon", "crossV", "crossH", "knighthead")


# ---------- wood materials ----------
def srgb(hexc):
    return tuple(((int(hexc[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (1, 3, 5)) + (1,)


def wood(name, hexc, scale):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, 0.25)
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 9.0
    wave.inputs["Distortion"].default_value = 2.5
    wave.inputs["Detail"].default_value = 3.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.55
    ramp.color_ramp.elements[0].color = (0.88, 0.84, 0.80, 1)
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[6].default_value = srgb(hexc)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.4
    for k, v in (("Coat Weight", 0.5), ("Coat Roughness", 0.35), ("Sheen Weight", 0.3), ("Sheen Roughness", 0.5)):
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v
    if "Sheen Tint" in bsdf.inputs:
        bsdf.inputs["Sheen Tint"].default_value = srgb("#e8b47a")
    return m


LIGHT, DARK = wood("LightWood", "#d9b07a", 3), wood("DarkWood", "#3a2a22", 3)
SQ_LIGHT, SQ_DARK = wood("SquareLight", "#d9b07a", 1.2), wood("SquareDark", "#3a2a22", 1.2)
FRAME = wood("Frame", "#8a5a32", 0.6)

col = bpy.data.collections.new("Chess")
scn.collection.children.link(col)


def add(name, me, mat, parent=None):
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    if not me.materials:
        me.materials.append(None)
    o.material_slots[0].link = "OBJECT"
    o.material_slots[0].material = mat
    if parent:
        o.parent = parent
    if me.name.startswith(BEVELED):
        bev = o.modifiers.new("Bevel", "BEVEL")
        bev.width = 0.03
        bev.segments = 3
        bev.harden_normals = False
    return o


# ---------- pieces in the starting position ----------
ORDER = "RNBQKBNR"
for f in range(8):
    for kind, rank, dark in ((ORDER[f], 0, False), ("P", 1, False), ("P", 6, True), (ORDER[f], 7, True)):
        e = bpy.data.objects.new(f"{kind}_{'abcdefgh'[f]}{rank + 1}", None)
        col.objects.link(e)
        e.location = (f - 3.5, rank - 3.5, 0.003)
        e.scale = (0.4,) * 3
        e.rotation_euler = (0, 0, (math.pi if dark else 0) + (math.pi / 4 if kind == "R" else 0))
        for me in PIECES[kind]:
            add(me.name, me, DARK if dark else LIGHT, e)

# ---------- board ----------
sq = box("square", (1, 1, 0.12))
for f in range(8):
    for r in range(8):
        o = add(f"sq_{'abcdefgh'[f]}{r + 1}", sq, SQ_DARK if (f + r) % 2 == 0 else SQ_LIGHT)
        o.location = (f - 3.5, r - 3.5, -0.06)
frame = add("Frame", box("frame", (9.4, 9.4, 0.34)), FRAME)
frame.location = (0, 0, -0.18)


# ---------- lights ----------
def aim(o, target):
    o.rotation_euler = (Vector(target) - o.location).to_track_quat("-Z", "Y").to_euler()


def sun(name, color, strength, loc, target, angle=2.0):
    d = bpy.data.lights.new(name, "SUN")
    d.color = srgb(color)[:3]
    d.energy = strength
    d.angle = math.radians(angle)
    o = bpy.data.objects.new(name, d)
    col.objects.link(o)
    o.location = loc
    aim(o, target)
    return o


PAWN_A2 = (-3.5, -2.5, 0)
sun("Key", "#fff2e0", 4.5, (-6, -6, 9), PAWN_A2, angle=3)
sun("RimAll", "#c48a55", 2.2, (0, 10, 4), (0, 0, 0))
spot = bpy.data.lights.new("RimB", "SPOT")
spot.color = srgb("#c48a55")[:3]
spot.energy = 250
spot.spot_size = 2 * math.pi / 7
spot.spot_blend = 0.6
so = bpy.data.objects.new("RimB", spot)
col.objects.link(so)
so.location = (-3.5, 5.2, 2.2)
aim(so, (-3.5, 2.5, 0.4))

# world: warm dark background + soft ambient fill
world = bpy.data.worlds.new("World")
scn.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = srgb("#2e231b")
bg.inputs["Strength"].default_value = 1.6

# ---------- camera (matches the HTML's OrbitControls start) ----------
cam_d = bpy.data.cameras.new("Camera")
cam_d.sensor_fit = "VERTICAL"
cam_d.angle_y = math.radians(32)
cam = bpy.data.objects.new("Camera", cam_d)
col.objects.link(cam)
cam.location = (-2.7, -5.2, 2.3)
aim(cam, (-3.5, -2.5, 0.55))
scn.camera = cam

# ---------- render ----------
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scn.render.engine = eng
        break
    except TypeError:
        pass
scn.render.resolution_x, scn.render.resolution_y = 1920, 1080
scn.view_settings.view_transform = "AgX"
scn.view_settings.look = "AgX - Base Contrast" if "AgX - Base Contrast" in [
    i.identifier for i in scn.view_settings.bl_rna.properties["look"].enum_items] else "None"
try:
    scn.eevee.use_shadows = True
    scn.eevee.use_raytracing = True
    scn.eevee.taa_render_samples = 64
except AttributeError:
    pass


def render(path, cam_loc=None, target=None, lens_angle=None):
    if cam_loc:
        cam.location = cam_loc
        aim(cam, target)
    if lens_angle:
        cam_d.angle_y = math.radians(lens_angle)
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote", path)


bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "pawn_toon.blend"))
render(os.path.join(OUT, "pawn_toon_closeup.png"))
render(os.path.join(OUT, "pawn_toon_board.png"), (-7.5, -9.5, 7.5), (0, 0, 0), 32)
