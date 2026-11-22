// Provision one private prototype staff account. Only the terminal operator sees the generated PIN.
import { pbkdf2Sync, randomInt, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [hospital, role, target] = process.argv.slice(2);
if (!/^[a-z0-9-]{1,64}$/.test(hospital ?? '') || !['admin','nurse','doctor'].includes(role) || !['--local','--remote'].includes(target)) {
  console.error('Usage: node scripts/staff.mjs <hospital-id> <nurse|doctor|admin> <--local|--remote>');
  process.exit(1);
}
const pin = String(randomInt(100000000)).padStart(8, '0');
const verifier = pbkdf2Sync(pin, 'niktan:' + hospital, 100000, 32, 'sha256').toString('hex');
const id = 'staff_' + randomUUID();
const sql = `INSERT INTO staff (id,hospital_id,role,pin_hash,demo_only) VALUES ('${id}','${hospital}','${role}','v2:${verifier}',0)`;
const cwd = fileURLToPath(new URL('../', import.meta.url));
const run = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'niktan', target, '--command', sql], { cwd, stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`Private ${role} account ${id} for ${hospital}. Enter this PIN in private staff mode: ${pin}`);
