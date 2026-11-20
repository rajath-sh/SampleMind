import { useRef, useState, type FormEvent } from 'react';
import { MoveRight } from 'lucide-react';
import { ConceptInfo, Dialog } from '../../../components/ConceptInfo';
import type { StorageLocation } from '../../storage/types';
import { samplesService } from '../samplesService';
import type { SampleDetail } from '../types';

export function MoveSpecimenForm({ sample, locations, onSaved }: {
  sample: SampleDetail;
  locations: StorageLocation[];
  onSaved: (sample: SampleDetail) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [location, setLocation] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const destinations = locations.filter(item => item.is_active && item.storage_location_id !== sample.current_storage_location_id);

  async function move(event: FormEvent) {
    event.preventDefault();
    if (!location || !reason.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await samplesService.updateSample(sample.sample_id, {
        current_storage_location_id: Number(location), movement_reason: reason.trim(),
        ...(sample.sample_status === 'REGISTERED' ? { sample_status: 'IN_STORAGE' } : {}),
      });
      dialog.current?.close();
      await onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lab-chips">
      <button className="btn-secondary" type="button" onClick={() => {
        setLocation('');
        setReason('');
        setError('');
        dialog.current?.showModal();
      }}><MoveRight size={15} /> Move specimen</button>
      <ConceptInfo title="Transactional custody transfer" steps={['Select active location', 'Lock specimen', 'Record custody movement', 'Commit audit']}>
        <p>Relocation updates the specimen’s storage foreign key and appends a movement record and audit event in the same SQL transaction. It also moves a registered specimen into storage.</p>
      </ConceptInfo>
      <Dialog title={`Move ${sample.sample_code}`} dialogRef={dialog}>
        <form className="reading-form" onSubmit={move}>
          <p className="lab-muted">Current location {sample.current_storage_location_code || 'Unassigned'}</p>
          <fieldset className="lab-controls" disabled={busy}>
            <label>Destination<select className="input-field" value={location} required onChange={event => setLocation(event.target.value)}>
              <option value="">Select active location</option>
              {destinations.map(item => <option key={item.storage_location_id} value={item.storage_location_id}>{item.location_code}</option>)}
            </select></label>
            <label>Reason<input className="input-field" required maxLength={300} value={reason}
              onChange={event => setReason(event.target.value)} /></label>
            <button type="submit" className="btn-primary" disabled={busy || destinations.length === 0}>{busy ? 'Saving…' : 'Save movement'}</button>
          </fieldset>
          {destinations.length === 0 && <p className="lab-muted">No other active location is available.</p>}
          {error && <p className="lab-error" role="alert">{error}</p>}
        </form>
      </Dialog>
    </div>
  );
}

