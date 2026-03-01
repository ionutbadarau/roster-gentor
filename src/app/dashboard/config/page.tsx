'use client';

import { useQueryClient } from '@tanstack/react-query';
import ConfigurationPanel from '@/components/scheduling/configuration-panel';
import { useDoctors, useTeams, useScheduleConfig, useUserId } from '@/lib/queries';

export default function ConfigPage() {
  const queryClient = useQueryClient();

  const { data: doctors = [], isLoading: loadingDoctors } = useDoctors();
  const { data: teams = [], isLoading: loadingTeams } = useTeams();
  const { data: config, isLoading: loadingConfig } = useScheduleConfig();
  const { data: userId = null } = useUserId();

  const loading = loadingDoctors || loadingTeams || loadingConfig;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ConfigurationPanel
        doctors={doctors}
        teams={teams}
        shiftsPerDay={config?.shiftsPerDay ?? 3}
        shiftsPerNight={config?.shiftsPerNight ?? 3}
        userId={userId}
        onUpdate={() => {
          queryClient.invalidateQueries();
        }}
      />
    </div>
  );
}
