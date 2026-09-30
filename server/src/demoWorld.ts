import type { Guest, Machine, MachineUnit, RackDevice, RackUnit, Service, World, DeviceType, Facing, Inventory } from '../../shared/model.js';
import { WORLD_SCHEMA } from '../../shared/model.js';
import type { MonitorInfo } from './sources/types.js';

/**
 * A demo world and matching fake monitors. Used when no Kuma is configured
 * (DEMO_MODE) and as a "load example layout" template in the editor.
 */
export function buildDemo(): { world: World; monitors: MonitorInfo[] } {
  const monitors: MonitorInfo[] = [];
  let nextId = 1;
  let seq = 0;
  const id = (p: string) => `${p}_${(++seq).toString(36).padStart(3, '0')}`;

  const mon = (name: string, type: string, target: string, parent: number | null = null): number => {
    const m: MonitorInfo = {
      id: nextId++,
      name,
      type,
      pathName: name,
      parent,
      url: type === 'http' || type === 'keyword' ? target : null,
      hostname: type === 'http' || type === 'keyword' ? null : target,
      port: type === 'port' ? Number(target.split(':')[1] ?? 0) || null : null,
      description: null,
      active: true,
      tags: [],
      interval: 60,
    };
    monitors.push(m);
    return m.id;
  };

  const svc = (name: string, type = 'http', target = `https://${name.toLowerCase().replace(/\s+/g, '-')}.lan`): Service => ({
    id: id('svc'),
    name,
    monitorId: mon(name, type, target),
  });

  const guest = (name: string, kind: Guest['kind'], services: Service[] = [], ip?: string): Guest => ({
    id: id('guest'),
    name,
    kind,
    monitorId: mon(name, 'ping', ip ?? `${name}.lan`),
    services,
    inventory: ip ? { ip } : {},
  });

  const machine = (
    name: string,
    type: DeviceType,
    opts: { host?: boolean; ip?: string; services?: Service[]; guests?: Guest[]; inventory?: Inventory } = {},
  ): Machine => ({
    id: id('m'),
    name,
    type,
    monitorId: opts.host === false ? null : mon(name, 'ping', opts.ip ?? `${name.toLowerCase().replace(/\s+/g, '-')}.lan`),
    services: opts.services ?? [],
    guests: opts.guests ?? [],
    inventory: { ip: opts.ip, ...(opts.inventory ?? {}) },
  });

  const dev = (u: number, size: number, m: Machine): RackDevice => ({ ...m, u, size });
  const rack = (name: string, x: number, y: number, heightU: number, devices: RackDevice[], facing: Facing = 'left'): RackUnit => ({
    id: id('rack'),
    kind: 'rack',
    name,
    pos: { x, y },
    facing,
    heightU,
    devices,
  });
  const standalone = (x: number, y: number, m: Machine, facing: Facing = 'left'): MachineUnit => ({
    ...m,
    kind: 'machine',
    pos: { x, y },
    facing,
  });
  const blank = (u: number, size = 1) => dev(u, size, machine('Blank', 'blank', { host: false }));
  const patch = (u: number) => dev(u, 1, machine('Patch panel', 'patch-panel', { host: false }));

  // ---------------------------------------------------------------- Home ---
  const pve4 = machine('pve4', 'server', {
    ip: '10.0.0.14',
    inventory: { os: 'Proxmox VE 9', cpu: 'Ryzen 9 7950X', ram: '128 GB', disk: '2× 2 TB NVMe' },
    services: [svc('Proxmox UI', 'http', 'https://10.0.0.14:8006')],
    guests: [
      guest('docker-host', 'vm', [svc('Jellyfin'), svc('Vaultwarden'), svc('Paperless'), svc('Immich')], '10.0.0.30'),
      guest('unifi', 'lxc', [svc('UniFi Controller', 'http', 'https://10.0.0.31:8443')], '10.0.0.31'),
      guest('adguard', 'lxc', [svc('AdGuard DNS', 'dns', '10.0.0.53')], '10.0.0.53'),
    ],
  });

  const homelab = rack('Homelab rack', 13, 1, 12, [
    patch(12),
    dev(11, 1, machine('USW-24', 'switch', { ip: '10.0.0.2' })),
    dev(10, 1, machine('OPNsense', 'firewall', { ip: '10.0.0.1', services: [svc('WireGuard', 'port', '10.0.0.1:51820'), svc('OPNsense UI', 'http', 'https://10.0.0.1')] })),
    blank(9),
    blank(8),
    dev(6, 2, pve4),
    blank(5),
    dev(3, 2, machine('Synology', 'nas', { ip: '10.0.0.5', inventory: { disk: '8× 12 TB' }, services: [svc('DSM', 'http', 'https://10.0.0.5:5001'), svc('SMB', 'port', '10.0.0.5:445')] })),
    dev(1, 2, machine('Eaton 5PX', 'ups', { ip: '10.0.0.9' })),
  ]);

  const house = {
    id: id('b'),
    name: 'House',
    kind: 'residential' as const,
    pos: { x: 5, y: 4 },
    w: 16,
    d: 12,
    floors: 2,
    floor: 'wood' as const,
    rooms: [
      { id: id('room'), name: 'Office', x: 0, y: 0, w: 8, d: 6, floor: 'carpet' as const },
      { id: id('room'), name: 'Utility', x: 8, y: 0, w: 8, d: 6, floor: 'tile' as const },
      { id: id('room'), name: 'Living room', x: 0, y: 6, w: 16, d: 6, floor: 'wood' as const },
    ],
    units: [
      homelab,
      standalone(10, 1, machine('Fiber ONT', 'modem', { ip: '192.168.100.1' })),
      standalone(10, 3, machine('Home Assistant', 'sbc', { ip: '10.0.0.20', services: [svc('Home Assistant', 'http', 'http://10.0.0.20:8123'), svc('Zigbee2MQTT')] })),
      standalone(1, 1, machine('Workstation', 'desktop', { ip: '10.0.0.101', inventory: { os: 'Windows 11', cpu: 'i7-13700K', ram: '64 GB' } })),
      standalone(5, 2, machine('MacBook Pro', 'laptop', { ip: '10.0.0.102' })),
      standalone(1, 4, machine('Brother Laser', 'printer', { ip: '10.0.0.150' })),
      standalone(2, 8, machine('Living room TV', 'tv', { ip: '10.0.0.160' })),
      standalone(9, 8, machine('AP Living room', 'access-point', { ip: '10.0.0.3' })),
      standalone(12, 9, machine('iPad', 'phone', { ip: '10.0.0.170' })),
    ],
  };

  const garage = {
    id: id('b'),
    name: 'Garage',
    kind: 'residential' as const,
    pos: { x: 5, y: 18 },
    w: 9,
    d: 6,
    floors: 1,
    floor: 'concrete' as const,
    rooms: [],
    units: [
      standalone(1, 1, machine('Driveway cam', 'camera', { ip: '10.0.1.20' })),
      standalone(4, 1, machine('Solar inverter', 'iot', { ip: '10.0.1.30' })),
      standalone(6, 3, machine('Wallbox', 'iot', { ip: '10.0.1.31' })),
    ],
  };

  // ------------------------------------------------------------ Datacenter ---
  const pve = (n: number, ip: string) =>
    machine(`pve${n}`, 'server', {
      ip,
      inventory: { os: 'Proxmox VE 9', cpu: '2× EPYC 9354', ram: '512 GB', serial: `DC-PVE-00${n}` },
      services: [svc(`pve${n} UI`, 'http', `https://${ip}:8006`)],
    });
  const pve1 = pve(1, '10.10.0.11');
  const pve2 = pve(2, '10.10.0.12');
  const pve3 = pve(3, '10.10.0.13');
  const k8s = [1, 2, 3].map((n) => machine(`k8s-${n}`, 'server', { ip: `10.10.1.${10 + n}` }));

  const upsDev = (name: string) => dev(1, 2, machine(name, 'ups'));
  const hall = {
    id: id('b'),
    name: 'Hall A',
    kind: 'datacenter' as const,
    pos: { x: 4, y: 4 },
    w: 26,
    d: 18,
    floors: 2,
    floor: 'raised' as const,
    rooms: [
      { id: id('room'), name: 'Server room', x: 0, y: 0, w: 18, d: 18, floor: 'raised' as const },
      { id: id('room'), name: 'NOC', x: 18, y: 0, w: 8, d: 18, floor: 'carpet' as const },
    ],
    units: [
      rack('R01', 3, 3, 42, [patch(42), dev(41, 1, machine('core-sw1', 'switch')), dev(36, 2, pve1), dev(30, 2, machine('ceph1', 'nas')), dev(24, 1, machine('pdu-r01', 'pdu')), upsDev('ups-r01')]),
      rack('R02', 4, 3, 42, [patch(42), dev(41, 1, machine('core-sw2', 'switch')), dev(36, 2, pve2), dev(30, 2, machine('ceph2', 'nas')), dev(24, 1, machine('pdu-r02', 'pdu')), upsDev('ups-r02')]),
      rack('R03', 5, 3, 42, [
        dev(41, 1, machine('fw-edge', 'firewall', { services: [svc('Site-to-site VPN', 'port', '10.10.0.1:500')] })),
        dev(40, 1, machine('edge-rtr', 'router')),
        dev(36, 2, pve3),
        dev(30, 2, machine('ceph3', 'nas')),
        upsDev('ups-r03'),
      ]),
      rack('R04', 6, 3, 42, [
        dev(34, 4, machine('pbs', 'server', { services: [svc('Proxmox Backup', 'http', 'https://10.10.0.20:8007')] })),
        dev(26, 4, machine('archive', 'nas', { services: [svc('S3 Gateway')] })),
        dev(20, 1, machine('KVM', 'kvm', { host: false })),
        upsDev('ups-r04'),
      ]),
      rack('R05', 7, 3, 42, [patch(42), dev(38, 1, k8s[0]), dev(37, 1, k8s[1]), dev(36, 1, k8s[2]), blank(35), blank(34), upsDev('ups-r05')]),
      rack('R06', 3, 10, 42, [
        dev(38, 2, machine('db1', 'server', { services: [svc('PostgreSQL', 'port', '10.10.2.11:5432')] })),
        dev(35, 2, machine('db2', 'server', { services: [svc('PostgreSQL replica', 'port', '10.10.2.12:5432')] })),
        upsDev('ups-r06'),
      ]),
      rack('R07', 4, 10, 42, [dev(30, 4, machine('gpu-node', 'server', { services: [svc('Ollama API', 'http', 'http://10.10.3.10:11434')] })), upsDev('ups-r07')]),
      rack('R08', 5, 10, 42, [blank(20, 2)]),
      standalone(19, 2, machine('NOC-1', 'desktop')),
      standalone(22, 2, machine('NOC-2', 'desktop')),
      standalone(20, 7, machine('Wall display', 'tv')),
      standalone(24, 13, machine('UPS NOC', 'ups')),
    ],
  };

  const office = {
    id: id('b'),
    name: 'Office',
    kind: 'commercial' as const,
    pos: { x: 33, y: 5 },
    w: 10,
    d: 12,
    floors: 4,
    floor: 'carpet' as const,
    rooms: [],
    units: [
      standalone(1, 1, machine('Reception PC', 'desktop')),
      standalone(5, 1, machine('Dev PC', 'desktop')),
      standalone(1, 6, machine('Office printer', 'printer')),
      standalone(6, 6, machine('AP Office', 'access-point')),
      standalone(4, 9, machine('Meeting tablet', 'phone')),
    ],
  };

  const world: World = {
    schema: WORLD_SCHEMA,
    sites: [
      { id: id('site'), name: 'Home', description: 'Homelab & family devices', theme: 'grass', pos: { x: 0, y: 0 }, w: 30, d: 26, buildings: [house, garage] },
      { id: id('site'), name: 'Frankfurt DC', description: 'Colocation', theme: 'urban', pos: { x: 40, y: -42 }, w: 46, d: 26, buildings: [hall, office] },
    ],
    clusters: [
      {
        id: id('cluster'),
        name: 'pve-cluster',
        kind: 'proxmox',
        color: '#8B7CF6',
        members: [pve1.id, pve2.id, pve3.id],
        quorum: 2,
        monitorId: mon('pve-cluster API', 'http', 'https://pve.dc.lan:8006'),
        guests: [
          guest('gitea', 'vm', [svc('Gitea')], '10.10.5.10'),
          guest('nextcloud', 'vm', [svc('Nextcloud')], '10.10.5.11'),
          guest('keycloak', 'lxc', [svc('Keycloak SSO')], '10.10.5.12'),
          guest('mail', 'vm', [svc('SMTP', 'port', '10.10.5.13:25'), svc('IMAP', 'port', '10.10.5.13:993')], '10.10.5.13'),
        ],
        services: [svc('Ceph health', 'http', 'https://pve.dc.lan/ceph')],
      },
      {
        id: id('cluster'),
        name: 'k8s-prod',
        kind: 'kubernetes',
        color: '#38BDF8',
        members: k8s.map((k) => k.id),
        quorum: 2,
        monitorId: mon('k8s API', 'port', 'k8s.dc.lan:6443'),
        guests: [],
        services: [svc('Ingress'), svc('Grafana'), svc('Web shop'), svc('Public API')],
      },
    ],
  };

  return { world, monitors };
}
