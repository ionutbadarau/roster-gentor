'use client';

import { useState, useMemo, useRef } from 'react';
import { Doctor, Team } from '@/types/scheduling';
import { createClient } from '../../../supabase/client';
import { useConfigMutations } from './use-config-mutations';
import ConfigTopBar from './config-top-bar';
import ConfigTeamGroup from './config-team-group';
import ConfigFloatingDoctors from './config-floating-doctors';
import ConfigAddTeamDialog from './config-add-team-dialog';
import ConfigAddDoctorDialog from './config-add-doctor-dialog';

interface ConfigurationPanelProps {
  doctors: Doctor[];
  teams: Team[];
  shiftsPerDay: number;
  shiftsPerNight: number;
  userId: string | null;
  onUpdate: () => void | Promise<void>;
}

export default function ConfigurationPanel({ doctors, teams, shiftsPerDay, shiftsPerNight, userId, onUpdate }: ConfigurationPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Dialog state
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [addDoctorOpen, setAddDoctorOpen] = useState(false);
  const [addDoctorDefaultTeamId, setAddDoctorDefaultTeamId] = useState<string | undefined>();

  // Team drag state
  const [teamDragOverId, setTeamDragOverId] = useState<string | null>(null);
  const teamDraggedIdRef = useRef<string | null>(null);

  const supabase = createClient();
  const mutations = useConfigMutations(supabase, userId, onUpdate);

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [teams],
  );

  const doctorsByTeam = useMemo(() => {
    const map = new Map<string | null, Doctor[]>();
    for (const d of doctors) {
      const key = d.team_id ?? null;
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return map;
  }, [doctors]);

  const floatingDoctors = doctorsByTeam.get(null) ?? [];

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleCancelEdit = () => setEditingId(null);

  const handleAddDoctorToTeam = (teamId: string) => {
    setAddDoctorDefaultTeamId(teamId);
    setAddDoctorOpen(true);
  };

  const handleAddDoctorGeneric = () => {
    setAddDoctorDefaultTeamId(undefined);
    setAddDoctorOpen(true);
  };

  return (
    <div className="space-y-4">
      <ConfigTopBar
        shiftsPerDay={shiftsPerDay}
        shiftsPerNight={shiftsPerNight}
        doctorCount={doctors.length}
        onSaveShiftSettings={mutations.saveShiftSettings}
        onAddTeamClick={() => setAddTeamOpen(true)}
        onAddDoctorClick={handleAddDoctorGeneric}
      />

      <div className="space-y-3">
        {sortedTeams.map((team) => {
          const teamDoctors = doctorsByTeam.get(team.id) ?? [];
          return (
            <ConfigTeamGroup
              key={team.id}
              team={team}
              doctors={teamDoctors}
              allTeams={teams}
              editingId={editingId}
              editingName={editingName}
              deletingId={deletingId}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onEditingNameChange={setEditingName}
              onRenameTeam={mutations.renameTeam}
              onDeleteTeam={mutations.deleteTeam}
              onToggleMaxPerShift={mutations.toggleMaxPerShift}
              onRenameDoctor={mutations.renameDoctor}
              onDeleteDoctor={mutations.deleteDoctor}
              onChangeTeam={mutations.changeTeam}
              onChangeShiftMode={mutations.changeShiftMode}
              onToggleOptional={mutations.toggleOptional}
              onToggleDispatch={mutations.toggleDispatch}
              onChangeEmail={mutations.updateEmail}
              onReorderDoctors={mutations.reorderDoctors}
              onAddDoctorToTeam={handleAddDoctorToTeam}
              setDeletingId={setDeletingId}
              teamDragHandleProps={{
                draggable: true,
                onDragStart: (e) => {
                  teamDraggedIdRef.current = team.id;
                  e.dataTransfer.effectAllowed = 'move';
                },
                onDragEnd: () => {
                  teamDraggedIdRef.current = null;
                  setTeamDragOverId(null);
                },
              }}
              onTeamDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setTeamDragOverId(team.id);
              }}
              onTeamDrop={(e) => {
                e.preventDefault();
                setTeamDragOverId(null);
                if (teamDraggedIdRef.current) {
                  mutations.reorderTeams(teamDraggedIdRef.current, team.id, sortedTeams);
                }
              }}
              isTeamDragOver={teamDragOverId === team.id}
            />
          );
        })}
      </div>

      <ConfigFloatingDoctors
        doctors={floatingDoctors}
        allTeams={teams}
        editingId={editingId}
        editingName={editingName}
        deletingId={deletingId}
        onStartEdit={handleStartEdit}
        onCancelEdit={handleCancelEdit}
        onEditingNameChange={setEditingName}
        onRenameDoctor={mutations.renameDoctor}
        onDeleteDoctor={mutations.deleteDoctor}
        onChangeTeam={mutations.changeTeam}
        onChangeShiftMode={mutations.changeShiftMode}
        onToggleOptional={mutations.toggleOptional}
        onToggleDispatch={mutations.toggleDispatch}
        onChangeEmail={mutations.updateEmail}
        onReorderDoctors={mutations.reorderDoctors}
        onAddDoctor={handleAddDoctorGeneric}
        setDeletingId={setDeletingId}
      />

      <ConfigAddTeamDialog
        open={addTeamOpen}
        onOpenChange={setAddTeamOpen}
        teams={teams}
        onAddTeam={mutations.addTeam}
      />

      <ConfigAddDoctorDialog
        open={addDoctorOpen}
        onOpenChange={setAddDoctorOpen}
        teams={teams}
        doctors={doctors}
        defaultTeamId={addDoctorDefaultTeamId}
        onAddDoctor={mutations.addDoctor}
      />
    </div>
  );
}
