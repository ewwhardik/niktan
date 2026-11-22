import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, writeStaffToken } from '../../lib/api';

export interface Staff {
  sid: string;
  hid: string;
  role: 'nurse' | 'doctor' | 'admin';
  demoMode: boolean;
}

/** Loads the signed-in staff member or sends them to the login screen. */
export function useStaff(): Staff | null {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<Staff | null>(null);
  useEffect(() => {
    api
      .get<Staff>('/api/hospital/me')
      .then(setStaff)
      .catch(() => navigate('/hospital', { replace: true }));
  }, [navigate]);
  return staff;
}

export async function logout() {
  await api.post('/api/hospital/logout').catch(() => undefined);
  writeStaffToken(null);
}

export function minutesSince(ts: number) {
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}
