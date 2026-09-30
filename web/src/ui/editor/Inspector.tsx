import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Boxes, ChevronDown, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import type { Building, BuildingKind, Cluster, DeviceType, FloorMaterial, Guest, Machine, RackDevice, RackUnit, Room, Service, Site, SiteTheme } from '../../../../shared/model';
import { DEVICE_TYPES, RACK_SIZES, allMachines, newId } from '../../../../shared/model';
import { indexWorld, type Indexed } from '../../state';
import { commit, focusCluster, navigate, select, useStore } from '../../state/store';
import { kindIcon } from '../panels';
import { Field, MonitorMultiPicker, MonitorPicker, Num, Segmented, Select, Text, TextArea } from './fields';
import { addBuilding, addDevice, addMachine, addRack, addRoom, addSite, find, freeSlot, newCluster, newGuest, newService, removeEntity, slotConflict } from './ops';

const FLOORS: { value: FloorMaterial; label: string }[] = [
  { value: 'raised', label: 'Raised floor (server room)' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'wood', label: 'Wood' },
  { value: 'carpet', label: 'Carpet' },
  { value: 'tile', label: 'Tiles' },
];

const THEMES: { value: SiteTheme; label: string }[] = [
  { value: 'grass', label: 'Grass' },
  { value: 'urban', label: 'Urban / paved' },
  { value: 'sand', label: 'Sand' },
  { value: 'snow', label: 'Snow' },
];

const KINDS: { value: BuildingKind; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'datacenter', label: 'Data center' },
];

function deviceOptions(mount: 'rack' | 'standalone') {
  return (Object.entries(DEVICE_TYPES) as [DeviceType, (typeof DEVICE_TYPES)[DeviceType]][])
    .filter(([, i]) => (mount === 'rack' ? i.rack : i.standalone))
    .map(([value, i]) => ({ value, label: i.label, group: i.group }));
}

/** Mutate one entity in a fresh draft. */
function upd(id: string, fn: (e: Indexed) => void, key?: string) {
  commit((w) => {
    const e = find(w, id);
    if (e) fn(e);
  }, { key: key ? `${id}:${key}` : undefined });
}

function ConfirmDelete({ onConfirm, label = 'Delete' }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`btn danger ${armed ? 'armed' : ''}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      <Trash2 size={14} /> {armed ? 'Click again to confirm' : label}
    </button>
  );
}

function Form({ icon, kind, title, actions, children }: { icon: ReactNode; kind: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="form">
      <div className="form-head">
        <span className="phead-icon sm">{icon}</span>
        <div>
          <div className="kicker">Editing {kind}</div>
          <div className="form-title">{title || 'Untitled'}</div>
        </div>
      </div>
      {actions && <div className="form-actions">{actions}</div>}
      {children}
    </div>
  );
}

function Group({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <fieldset className="group">
      <legend>
        {title}
        {right}
      </legend>
      {children}
    </fieldset>
  );
}

function Grid2({ children }: { children: ReactNode }) {
  return <div className="grid2">{children}</div>;
}

// ---------------------------------------------------------------------------

function WorldForm() {
  const world = useStore((s) => s.world)!;
  return (
    <Form icon={<Boxes size={16} />} kind="world" title="Your world">
      <p className="muted small">Build your infrastructure from the outside in: sites hold buildings, buildings hold racks and devices. Select anything in the world to edit it, double-click to go inside, drag to move (hold Alt for fine steps).</p>
      <div className="btn-row">
        <button
          className="btn primary"
          onClick={() => {
            let id = '';
            commit((w) => {
              id = addSite(w).id;
            });
            select(id);
          }}
        >
          <Plus size={14} /> Add site
        </button>
        <button className="btn" onClick={() => useStore.setState({ clustersOpen: true })}>
          Manage clusters
        </button>
      </div>
      <Group title="Sites">
        <div className="rows">
          {world.sites.map((s) => (
            <button key={s.id} className="row" onClick={() => select(s.id)}>
              <span className="row-icon">{kindIcon('site', 14)}</span>
              <span className="row-main">
                <span className="row-title">{s.name}</span>
                <span className="row-sub">{s.buildings.length} buildings</span>
              </span>
              <ChevronRight size={14} className="row-chev" />
            </button>
          ))}
        </div>
      </Group>
    </Form>
  );
}

function SiteForm({ site }: { site: Site }) {
  const u = (fn: (s: Site) => void, key?: string) => upd(site.id, (e) => e.kind === 'site' && fn(e.site), key);
  return (
    <Form
      icon={kindIcon('site', 16)}
      kind="site"
      title={site.name}
      actions={
        <button className="btn" onClick={() => navigate([site.id])}>
          Enter <ArrowRight size={14} />
        </button>
      }
    >
      <Field label="Name">
        <Text value={site.name} onChange={(v) => u((s) => (s.name = v), 'name')} />
      </Field>
      <Field label="Description">
        <Text value={site.description} onChange={(v) => u((s) => (s.description = v), 'desc')} placeholder="e.g. Homelab, colocation…" />
      </Field>
      <Field label="Ground">
        <Select value={site.theme} options={THEMES} onChange={(v) => u((s) => (s.theme = v))} />
      </Field>
      <Grid2>
        <Field label="Width (tiles)">
          <Num value={site.w} min={8} max={400} onChange={(v) => u((s) => (s.w = v), 'w')} />
        </Field>
        <Field label="Depth (tiles)">
          <Num value={site.d} min={8} max={400} onChange={(v) => u((s) => (s.d = v), 'd')} />
        </Field>
      </Grid2>
      <Group title="Add building">
        <div className="btn-row">
          {KINDS.map((k) => (
            <button
              key={k.value}
              className="btn"
              onClick={() => {
                let id = '';
                upd(site.id, (e) => {
                  if (e.kind === 'site') id = addBuilding(e.site, k.value).id;
                });
                if (id) select(id);
              }}
            >
              {kindIcon(k.value, 14)} {k.label}
            </button>
          ))}
        </div>
      </Group>
      <Group title="Buildings">
        <div className="rows">
          {site.buildings.map((b) => (
            <button key={b.id} className="row" onClick={() => select(b.id)}>
              <span className="row-icon">{kindIcon(b.kind, 14)}</span>
              <span className="row-main">
                <span className="row-title">{b.name}</span>
                <span className="row-sub">{b.units.length} units</span>
              </span>
              <ChevronRight size={14} className="row-chev" />
            </button>
          ))}
          {!site.buildings.length && <div className="empty-note">No buildings yet.</div>}
        </div>
      </Group>
      <div className="danger-zone">
        <ConfirmDelete
          label="Delete site"
          onConfirm={() => {
            commit((w) => removeEntity(w, site.id));
            select(null);
            navigate([]);
          }}
        />
      </div>
    </Form>
  );
}

function BuildingForm({ site, b }: { site: Site; b: Building }) {
  const u = (fn: (x: Building) => void, key?: string) => upd(b.id, (e) => e.kind === 'building' && fn(e.building), key);
  const [devType, setDevType] = useState<DeviceType>('desktop');
  const [rackU, setRackU] = useState(42);
  const addUnit = (fn: (x: Building) => string) => {
    let id = '';
    u((x) => {
      id = fn(x);
    });
    if (id) select(id);
  };
  return (
    <Form
      icon={kindIcon(b.kind, 16)}
      kind="building"
      title={b.name}
      actions={
        <button className="btn" onClick={() => navigate([site.id, b.id])}>
          Enter <ArrowRight size={14} />
        </button>
      }
    >
      <Field label="Name">
        <Text value={b.name} onChange={(v) => u((x) => (x.name = v), 'name')} />
      </Field>
      <Field label="Type">
        <Segmented value={b.kind} options={KINDS} onChange={(v) => u((x) => (x.kind = v))} />
      </Field>
      <Grid2>
        <Field label="Width">
          <Num value={b.w} min={4} max={site.w - b.pos.x} onChange={(v) => u((x) => (x.w = v), 'w')} />
        </Field>
        <Field label="Depth">
          <Num value={b.d} min={4} max={site.d - b.pos.y} onChange={(v) => u((x) => (x.d = v), 'd')} />
        </Field>
        <Field label="Storeys (exterior)">
          <Num value={b.floors} min={1} max={30} onChange={(v) => u((x) => (x.floors = v), 'floors')} />
        </Field>
        <Field label="Floor">
          <Select value={b.floor} options={FLOORS} onChange={(v) => u((x) => (x.floor = v))} />
        </Field>
      </Grid2>
      <p className="muted small">Drag racks and devices in the world to rearrange them – they snap to the floor grid (hold Alt for ¼ steps) and won't overlap. Select one and press R to turn it around.</p>
      <Group title="Add inside">
        <div className="add-line">
          <Select value={rackU} options={RACK_SIZES.map((n) => ({ value: n, label: `${n}U rack` }))} onChange={setRackU} />
          <button className="btn" onClick={() => addUnit((x) => addRack(x, rackU).id)}>
            <Plus size={14} /> Rack
          </button>
        </div>
        <div className="add-line">
          <Select value={devType} options={deviceOptions('standalone')} onChange={setDevType} />
          <button className="btn" onClick={() => addUnit((x) => addMachine(x, devType).id)}>
            <Plus size={14} /> Device
          </button>
        </div>
        <button className="btn" onClick={() => addUnit((x) => addRoom(x).id)}>
          <Plus size={14} /> Room
        </button>
      </Group>
      {b.rooms.length > 0 && (
        <Group title="Rooms">
          <div className="rows">
            {b.rooms.map((r) => (
              <button key={r.id} className="row" onClick={() => select(r.id)}>
                <span className="row-main">
                  <span className="row-title">{r.name}</span>
                  <span className="row-sub">
                    {r.w}×{r.d} at {r.x},{r.y}
                  </span>
                </span>
                <ChevronRight size={14} className="row-chev" />
              </button>
            ))}
          </div>
        </Group>
      )}
      <Group title={`Units (${b.units.length})`}>
        <div className="rows">
          {b.units.map((x) => (
            <button key={x.id} className="row" onClick={() => select(x.id)}>
              <span className="row-icon">{kindIcon(x.kind === 'rack' ? 'rack' : 'machine', 14)}</span>
              <span className="row-main">
                <span className="row-title">{x.name}</span>
                <span className="row-sub">{x.kind === 'rack' ? `${x.heightU}U rack` : DEVICE_TYPES[x.type].label}</span>
              </span>
              <ChevronRight size={14} className="row-chev" />
            </button>
          ))}
        </div>
      </Group>
      <div className="danger-zone">
        <ConfirmDelete
          label="Delete building"
          onConfirm={() => {
            commit((w) => removeEntity(w, b.id));
            select(null);
            navigate([site.id]);
          }}
        />
      </div>
    </Form>
  );
}

function RoomForm({ b, room }: { b: Building; room: Room }) {
  const u = (fn: (x: Room) => void, key?: string) => upd(room.id, (e) => e.kind === 'room' && fn(e.room), key);
  return (
    <Form icon={kindIcon('room', 16)} kind="room" title={room.name}>
      <Field label="Name">
        <Text value={room.name} onChange={(v) => u((x) => (x.name = v), 'name')} />
      </Field>
      <Field label="Floor">
        <Select value={room.floor} options={FLOORS} onChange={(v) => u((x) => (x.floor = v))} />
      </Field>
      <Grid2>
        <Field label="X">
          <Num value={room.x} min={0} max={b.w - 1} onChange={(v) => u((x) => (x.x = v), 'x')} />
        </Field>
        <Field label="Y">
          <Num value={room.y} min={0} max={b.d - 1} onChange={(v) => u((x) => (x.y = v), 'y')} />
        </Field>
        <Field label="Width">
          <Num value={room.w} min={1} max={b.w - room.x} onChange={(v) => u((x) => (x.w = v), 'w')} />
        </Field>
        <Field label="Depth">
          <Num value={room.d} min={1} max={b.d - room.y} onChange={(v) => u((x) => (x.d = v), 'd')} />
        </Field>
      </Grid2>
      <div className="danger-zone">
        <ConfirmDelete
          label="Delete room"
          onConfirm={() => {
            commit((w) => removeEntity(w, room.id));
            select(b.id);
          }}
        />
      </div>
    </Form>
  );
}

function RackForm({ path, rack }: { path: string[]; rack: RackUnit }) {
  const u = (fn: (x: RackUnit) => void, key?: string) => upd(rack.id, (e) => e.kind === 'rack' && fn(e.rack), key);
  const [devType, setDevType] = useState<DeviceType>('server');
  const [size, setSize] = useState(DEVICE_TYPES.server.defaultU);
  const free = freeSlot(rack, size);
  return (
    <Form
      icon={kindIcon('rack', 16)}
      kind="rack"
      title={rack.name}
      actions={
        <button className="btn" onClick={() => navigate(path)}>
          Open <ArrowRight size={14} />
        </button>
      }
    >
      <Field label="Name">
        <Text value={rack.name} onChange={(v) => u((x) => (x.name = v), 'name')} />
      </Field>
      <Grid2>
        <Field label="Height">
          <Select value={rack.heightU} options={RACK_SIZES.map((n) => ({ value: n, label: `${n}U` }))} onChange={(v) => u((x) => (x.heightU = Math.max(v, ...x.devices.map((d) => d.u + d.size - 1))))} />
        </Field>
        <Field label="Front faces">
          <Segmented value={rack.facing} options={[{ value: 'left', label: '↙ left' }, { value: 'right', label: 'right ↘' }]} onChange={(v) => u((x) => (x.facing = v))} />
        </Field>
      </Grid2>
      <Group title="Add device">
        <div className="add-line">
          <Select
            value={devType}
            options={deviceOptions('rack')}
            onChange={(v) => {
              setDevType(v);
              setSize(DEVICE_TYPES[v].defaultU);
            }}
          />
          <Select value={size} options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: `${n}U` }))} onChange={setSize} />
        </div>
        <button
          className="btn primary"
          disabled={free == null}
          onClick={() => {
            let id = '';
            u((x) => {
              id = addDevice(x, devType, size)?.id ?? '';
            });
            if (id) select(id);
          }}
        >
          <Plus size={14} /> {free == null ? 'No free slot' : `Add at U${free}`}
        </button>
      </Group>
      <Group title="Devices">
        <div className="rows">
          {[...rack.devices]
            .sort((a, b) => b.u - a.u)
            .map((d) => (
              <button key={d.id} className="row" onClick={() => select(d.id)}>
                <span className="u-badge">U{d.u}</span>
                <span className="row-main">
                  <span className="row-title">{d.name}</span>
                  <span className="row-sub">
                    {DEVICE_TYPES[d.type].label} · {d.size}U
                  </span>
                </span>
                <ChevronRight size={14} className="row-chev" />
              </button>
            ))}
          {!rack.devices.length && <div className="empty-note">Empty rack.</div>}
        </div>
      </Group>
      <div className="danger-zone">
        <ConfirmDelete
          label="Delete rack"
          onConfirm={() => {
            commit((w) => removeEntity(w, rack.id));
            select(null);
            navigate(path.slice(0, 2));
          }}
        />
      </div>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Services & guests
// ---------------------------------------------------------------------------

type ListOwner = { id: string; guestId?: string };

function servicesOf(e: Indexed | undefined, guestId?: string): Service[] | null {
  if (!e) return null;
  const owner = e.kind === 'machine' ? e.machine : e.kind === 'cluster' ? e.cluster : null;
  if (!owner) return null;
  if (guestId) return owner.guests.find((g) => g.id === guestId)?.services ?? null;
  return owner.services;
}

function updServices(o: ListOwner, fn: (list: Service[]) => void, key?: string) {
  commit((w) => {
    const list = servicesOf(find(w, o.id), o.guestId);
    if (list) fn(list);
  }, { key: key ? `${o.id}:${o.guestId ?? ''}:${key}` : undefined });
}

export function ServicesEditor({ owner, services, hint }: { owner: ListOwner; services: Service[]; hint?: string }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="svc-editor">
      {services.map((s, i) => (
        <div key={s.id} className="svc-row">
          <div className="svc-row-top">
            <input className="input" value={s.name} onChange={(e) => updServices(owner, (l) => (l[i].name = e.target.value), `n${s.id}`)} />
            <button className="icon-btn" title="Remove" onClick={() => updServices(owner, (l) => void l.splice(i, 1))}>
              <Trash2 size={14} />
            </button>
          </div>
          <MonitorPicker
            value={s.monitorId}
            hints={[s.name]}
            onChange={(id, m) =>
              updServices(owner, (l) => {
                l[i].monitorId = id;
                if (m && (/^Service( \d+)?$/.test(l[i].name) || !l[i].name)) l[i].name = m.name;
              })
            }
          />
          <input className="input" placeholder="Link (optional), e.g. https://jellyfin.lan" value={s.url ?? ''} onChange={(e) => updServices(owner, (l) => (l[i].url = e.target.value || undefined), `u${s.id}`)} />
        </div>
      ))}
      {!services.length && <div className="empty-note">{hint ?? 'No services.'}</div>}
      <div className="btn-row">
        <button className="btn sm" onClick={() => updServices(owner, (l) => void l.push(newService(`Service ${l.length + 1}`)))}>
          <Plus size={13} /> Service
        </button>
        <button className="btn sm" onClick={() => setPicking(true)}>
          <Plus size={13} /> From Kuma…
        </button>
      </div>
      {picking && <MonitorMultiPicker onClose={() => setPicking(false)} onPick={(ms) => updServices(owner, (l) => void l.push(...ms.map((m) => newService(m.name, m.id))))} />}
    </div>
  );
}

function updGuests(ownerId: string, fn: (list: Guest[]) => void, key?: string) {
  commit((w) => {
    const e = find(w, ownerId);
    const owner = e?.kind === 'machine' ? e.machine : e?.kind === 'cluster' ? e.cluster : null;
    if (owner) fn(owner.guests);
  }, { key: key ? `${ownerId}:g:${key}` : undefined });
}

export function GuestsEditor({ ownerId, guests }: { ownerId: string; guests: Guest[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="guest-editor">
      {guests.map((g, i) => (
        <div key={g.id} className={`guest-card ${open === g.id ? 'open' : ''}`}>
          <button className="guest-card-head" onClick={() => setOpen(open === g.id ? null : g.id)}>
            {open === g.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="tag">{g.kind.toUpperCase()}</span>
            <span className="row-title">{g.name}</span>
            <span className="muted small">{g.services.length} svc</span>
          </button>
          {open === g.id && (
            <div className="guest-card-body">
              <Grid2>
                <Field label="Name">
                  <Text value={g.name} onChange={(v) => updGuests(ownerId, (l) => (l[i].name = v), `n${g.id}`)} />
                </Field>
                <Field label="Kind">
                  <Segmented value={g.kind} options={[{ value: 'vm', label: 'VM' }, { value: 'lxc', label: 'LXC' }, { value: 'container', label: 'Docker' }]} onChange={(v) => updGuests(ownerId, (l) => (l[i].kind = v))} />
                </Field>
              </Grid2>
              <Field label="Guest monitor">
                <MonitorPicker value={g.monitorId} hints={[g.name, g.inventory?.ip]} onChange={(id) => updGuests(ownerId, (l) => (l[i].monitorId = id))} />
              </Field>
              <Field label="IP">
                <Text mono value={g.inventory?.ip} onChange={(v) => updGuests(ownerId, (l) => (l[i].inventory = { ...(l[i].inventory ?? {}), ip: v }), `ip${g.id}`)} />
              </Field>
              <Field label="Services">
                <ServicesEditor owner={{ id: ownerId, guestId: g.id }} services={g.services} />
              </Field>
              <button className="btn danger sm" onClick={() => updGuests(ownerId, (l) => void l.splice(i, 1))}>
                <Trash2 size={13} /> Remove {g.kind.toUpperCase()}
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        className="btn sm"
        onClick={() => {
          const g = newGuest(`guest-${guests.length + 1}`);
          updGuests(ownerId, (l) => void l.push(g));
          setOpen(g.id);
        }}
      >
        <Plus size={13} /> VM / container
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MachineForm({ e }: { e: Extract<Indexed, { kind: 'machine' }> }) {
  const world = useStore((s) => s.world)!;
  const m = e.machine;
  const rack = e.rack;
  const u = (fn: (x: Machine) => void, key?: string) => upd(m.id, (x) => x.kind === 'machine' && fn(x.machine), key);
  const dev = rack ? (m as RackDevice) : null;
  const conflict = rack && dev ? slotConflict(rack, dev.u, dev.size, dev.id) : null;
  const inv = m.inventory;
  const invField = (k: keyof Machine['inventory'], label: string, mono = false) => (
    <Field label={label}>
      <Text mono={mono} value={inv[k]} onChange={(v) => u((x) => (x.inventory = { ...x.inventory, [k]: v }), `inv-${k}`)} />
    </Field>
  );
  return (
    <Form
      icon={kindIcon(m.type, 16)}
      kind={rack ? 'rack device' : 'device'}
      title={m.name}
      actions={
        <>
          <button className="btn" onClick={() => navigate(e.path)}>
            Open <ArrowRight size={14} />
          </button>
          <button
            className="btn"
            title="Duplicate"
            onClick={() => {
              let id = '';
              commit((w) => {
                const x = find(w, m.id);
                if (x?.kind !== 'machine') return;
                const copy = structuredClone(x.machine) as RackDevice;
                copy.id = newId('m');
                copy.name = `${x.machine.name} copy`;
                copy.monitorId = null;
                copy.services = copy.services.map((s) => ({ ...s, id: newId('svc'), monitorId: null }));
                copy.guests = copy.guests.map((g) => ({ ...g, id: newId('guest'), monitorId: null, services: g.services.map((s) => ({ ...s, id: newId('svc'), monitorId: null })) }));
                if (x.rack) {
                  const slot = freeSlot(x.rack, copy.size);
                  if (slot == null) return;
                  copy.u = slot;
                  x.rack.devices.push(copy);
                } else {
                  const b = x.building;
                  const nm = addMachine(b, x.machine.type);
                  Object.assign(nm, { ...copy, kind: 'machine', pos: nm.pos, facing: (x.unit as { facing: 'left' | 'right' }).facing });
                }
                id = copy.id;
              });
              if (id) select(id);
            }}
          >
            <Copy size={14} />
          </button>
        </>
      }
    >
      <Field label="Name">
        <Text value={m.name} onChange={(v) => u((x) => (x.name = v), 'name')} />
      </Field>
      <Field label="Type">
        <Select value={m.type} options={deviceOptions(rack ? 'rack' : 'standalone')} onChange={(v) => u((x) => (x.type = v))} />
      </Field>
      {rack && dev ? (
        <Grid2>
          <Field label="Position (lowest U)" error={conflict}>
            <Num value={dev.u} min={1} max={rack.heightU} onChange={(v) => u((x) => ((x as RackDevice).u = v), 'u')} />
          </Field>
          <Field label="Height (U)">
            <Num value={dev.size} min={1} max={rack.heightU} onChange={(v) => u((x) => ((x as RackDevice).size = v), 'size')} />
          </Field>
        </Grid2>
      ) : (
        <Field label="Front faces">
          <Segmented value={(e.unit as { facing: 'left' | 'right' }).facing} options={[{ value: 'left', label: '↙ left' }, { value: 'right', label: 'right ↘' }]} onChange={(v) => upd(m.id, (x) => x.kind === 'machine' && x.unit.kind === 'machine' && (x.unit.facing = v))} />
        </Field>
      )}
      <Group title="Host status">
        <Field label="Host monitor" hint="Drives the device's main LED (ping, agent, …)">
          <MonitorPicker value={m.monitorId} hints={[m.name, inv.ip]} onChange={(id) => u((x) => (x.monitorId = id))} />
        </Field>
      </Group>
      <Group title="Services">
        <ServicesEditor owner={{ id: m.id }} services={m.services} hint="Services running directly on this device." />
      </Group>
      <Group title="VMs & containers">
        <GuestsEditor ownerId={m.id} guests={m.guests} />
      </Group>
      <Group title="Clusters">
        {world.clusters.map((c) => (
          <label key={c.id} className="check">
            <input
              type="checkbox"
              checked={c.members.includes(m.id)}
              onChange={(ev) =>
                upd(c.id, (x) => {
                  if (x.kind !== 'cluster') return;
                  x.cluster.members = ev.target.checked ? [...x.cluster.members, m.id] : x.cluster.members.filter((id) => id !== m.id);
                })
              }
            />
            <span className="swatch" style={{ background: c.color }} /> {c.name}
          </label>
        ))}
        <button className="btn sm" onClick={() => useStore.setState({ clustersOpen: true })}>
          Manage clusters…
        </button>
      </Group>
      <Group title="Inventory">
        <Grid2>
          {invField('ip', 'IP address', true)}
          {invField('os', 'OS')}
          {invField('cpu', 'CPU')}
          {invField('ram', 'Memory')}
          {invField('disk', 'Storage')}
          {invField('serial', 'Serial', true)}
          {invField('purchased', 'Purchased')}
          {invField('url', 'Web UI URL')}
        </Grid2>
        <Field label="Notes">
          <TextArea value={inv.notes} onChange={(v) => u((x) => (x.inventory = { ...x.inventory, notes: v }), 'notes')} />
        </Field>
      </Group>
      <div className="danger-zone">
        <ConfirmDelete
          label="Delete device"
          onConfirm={() => {
            commit((w) => removeEntity(w, m.id));
            select(null);
            navigate(rack ? e.path.slice(0, 3) : e.path.slice(0, 2));
          }}
        />
      </div>
    </Form>
  );
}

export function ClusterForm({ c }: { c: Cluster }) {
  const world = useStore((s) => s.world)!;
  const u = (fn: (x: Cluster) => void, key?: string) => upd(c.id, (e) => e.kind === 'cluster' && fn(e.cluster), key);
  const [filter, setFilter] = useState('');
  const machines = allMachines(world).filter(({ machine, location }) => `${machine.name} ${location}`.toLowerCase().includes(filter.toLowerCase()));
  const colors = ['#8B7CF6', '#38BDF8', '#F472B6', '#34D399', '#FBBF24', '#FB7185', '#A3E635', '#94A3B8'];
  return (
    <Form
      icon={<span className="swatch lg" style={{ background: c.color }} />}
      kind="cluster"
      title={c.name}
      actions={
        <button className="btn" onClick={() => focusCluster(c.id)}>
          Show <ArrowRight size={14} />
        </button>
      }
    >
      <Grid2>
        <Field label="Name">
          <Text value={c.name} onChange={(v) => u((x) => (x.name = v), 'name')} />
        </Field>
        <Field label="Kind">
          <Select
            value={c.kind}
            options={[
              { value: 'proxmox', label: 'Proxmox HA' },
              { value: 'kubernetes', label: 'Kubernetes' },
              { value: 'swarm', label: 'Docker Swarm' },
              { value: 'generic', label: 'Generic' },
            ]}
            onChange={(v) => u((x) => (x.kind = v))}
          />
        </Field>
      </Grid2>
      <Field label="Colour">
        <div className="swatches">
          {colors.map((col) => (
            <button key={col} className={`swatch-btn ${c.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => u((x) => (x.color = col))} />
          ))}
        </div>
      </Field>
      <Grid2>
        <Field label="Quorum" hint="Nodes that must be up (empty = majority)">
          <input
            className="input num"
            type="number"
            min={1}
            value={c.quorum ?? ''}
            placeholder={String(Math.floor(c.members.length / 2) + 1)}
            onChange={(e) => u((x) => (x.quorum = e.target.value === '' ? null : Math.max(1, Number(e.target.value))), 'quorum')}
          />
        </Field>
        <Field label="Cluster endpoint">
          <MonitorPicker value={c.monitorId} hints={[c.name]} onChange={(id) => u((x) => (x.monitorId = id))} />
        </Field>
      </Grid2>
      <Group title={`Members (${c.members.length})`}>
        <div className="menu-search boxed">
          <input placeholder="Filter devices…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="member-list">
          {machines.map(({ machine, location }) => (
            <label key={machine.id} className="check">
              <input type="checkbox" checked={c.members.includes(machine.id)} onChange={(e) => u((x) => (x.members = e.target.checked ? [...x.members, machine.id] : x.members.filter((id) => id !== machine.id)))} />
              <span className="row-main">
                <span className="row-title">{machine.name}</span>
                <span className="row-sub">{location}</span>
              </span>
            </label>
          ))}
          {!machines.length && <div className="empty-note">No devices found.</div>}
        </div>
      </Group>
      <Group title="HA VMs & containers">
        <GuestsEditor ownerId={c.id} guests={c.guests} />
      </Group>
      <Group title="Cluster services">
        <ServicesEditor owner={{ id: c.id }} services={c.services} hint="Services that float between members." />
      </Group>
      <div className="danger-zone">
        <ConfirmDelete
          label="Delete cluster"
          onConfirm={() => {
            commit((w) => removeEntity(w, c.id));
            select(null);
            focusCluster(null);
          }}
        />
      </div>
    </Form>
  );
}

/** Edit-mode side panel: edits the selection, or the focused thing when nothing is selected. */
export function Inspector() {
  const world = useStore((s) => s.world);
  const focus = useStore((s) => s.focus);
  const selected = useStore((s) => s.selected);
  if (!world) return null;
  const idx = indexWorld(world);
  const id = selected ?? focus.cluster ?? focus.path[focus.path.length - 1];
  let e = id ? idx.get(id) : undefined;
  // Services/guests are edited on their machine.
  if (e && (e.kind === 'service' || e.kind === 'guest')) e = e.ownerKind === 'cluster' ? idx.get(e.owner.id) : idx.get(e.owner.id);
  if (!e) return <WorldForm />;
  switch (e.kind) {
    case 'site':
      return <SiteForm site={e.site} />;
    case 'building':
      return <BuildingForm site={e.site} b={e.building} />;
    case 'room':
      return <RoomForm b={e.building} room={e.room} />;
    case 'rack':
      return <RackForm path={e.path} rack={e.rack} />;
    case 'machine':
      return <MachineForm e={e} />;
    case 'cluster':
      return <ClusterForm c={e.cluster} />;
    default:
      return <WorldForm />;
  }
}

export function newClusterAndSelect() {
  let id = '';
  commit((w) => {
    id = newCluster(w).id;
  });
  return id;
}
