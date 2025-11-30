'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Doctor, Team } from '@/types/scheduling';
import { createClient } from '../../../supabase/client';
import { Plus, Trash2, Users, Save } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ConfigurationPanelProps {
  doctors: Doctor[];
  teams: Team[];
  onUpdate: () => void;
}

export default function ConfigurationPanel({ doctors, teams, onUpdate }: ConfigurationPanelProps) {
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3b82f6');
  const [newTeamMaxMembers, setNewTeamMaxMembers] = useState(3);
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDoctorEmail, setNewDoctorEmail] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [isFloating, setIsFloating] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();
  const { toast } = useToast();

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) {
      toast({
        title: 'Error',
        description: 'Team name is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('teams').insert({
        name: newTeamName,
        color: newTeamColor,
        max_members: newTeamMaxMembers,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Team added successfully',
      });

      setNewTeamName('');
      setNewTeamColor('#3b82f6');
      setNewTeamMaxMembers(3);
      onUpdate();
    } catch (error) {
      console.error('Error adding team:', error);
      toast({
        title: 'Error',
        description: 'Failed to add team',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('teams').delete().eq('id', teamId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Team deleted successfully',
      });

      onUpdate();
    } catch (error) {
      console.error('Error deleting team:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete team',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDoctor = async () => {
    if (!newDoctorName.trim()) {
      toast({
        title: 'Error',
        description: 'Doctor name is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('doctors').insert({
        name: newDoctorName,
        email: newDoctorEmail || null,
        team_id: selectedTeamId || null,
        is_floating: isFloating,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Doctor added successfully',
      });

      setNewDoctorName('');
      setNewDoctorEmail('');
      setSelectedTeamId('');
      setIsFloating(false);
      onUpdate();
    } catch (error) {
      console.error('Error adding doctor:', error);
      toast({
        title: 'Error',
        description: 'Failed to add doctor',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDoctor = async (doctorId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('doctors').delete().eq('id', doctorId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Doctor removed successfully',
      });

      onUpdate();
    } catch (error) {
      console.error('Error deleting doctor:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove doctor',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const teamColors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Configuration
          </CardTitle>
          <CardDescription>
            Define shift teams and their maximum capacity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                placeholder="e.g., Team Alpha"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Team Color</Label>
              <div className="flex gap-2">
                {teamColors.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      newTeamColor === color ? 'border-primary scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTeamColor(color)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-members">Max Members</Label>
              <Input
                id="max-members"
                type="number"
                min="1"
                max="10"
                value={newTeamMaxMembers}
                onChange={(e) => setNewTeamMaxMembers(parseInt(e.target.value) || 3)}
              />
            </div>

            <Button onClick={handleAddTeam} disabled={loading} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Team
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Existing Teams ({teams.length})</Label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <div>
                      <p className="font-medium">{team.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Max {team.max_members} members
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTeam(team.id)}
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {teams.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No teams configured yet
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Doctor Management
          </CardTitle>
          <CardDescription>
            Add doctors and assign them to teams
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doctor-name">Doctor Name</Label>
              <Input
                id="doctor-name"
                placeholder="Dr. John Smith"
                value={newDoctorName}
                onChange={(e) => setNewDoctorName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doctor-email">Email (Optional)</Label>
              <Input
                id="doctor-email"
                type="email"
                placeholder="doctor@hospital.com"
                value={newDoctorEmail}
                onChange={(e) => setNewDoctorEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team-select">Assign to Team</Label>
              <select
                id="team-select"
                className="w-full px-3 py-2 rounded-md border border-input bg-background"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                disabled={isFloating}
              >
                <option value="">No Team (Floating)</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label htmlFor="floating-switch">Floating Staff</Label>
                <p className="text-xs text-muted-foreground">
                  Can fill in for any team
                </p>
              </div>
              <Switch
                id="floating-switch"
                checked={isFloating}
                onCheckedChange={(checked) => {
                  setIsFloating(checked);
                  if (checked) setSelectedTeamId('');
                }}
              />
            </div>

            <Button onClick={handleAddDoctor} disabled={loading} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Doctor
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Doctors ({doctors.length})</Label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {doctors.map((doctor) => {
                const team = teams.find((t) => t.id === doctor.team_id);
                return (
                  <div
                    key={doctor.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      {team && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                      )}
                      <div>
                        <p className="font-medium">{doctor.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doctor.is_floating
                            ? 'Floating Staff'
                            : team
                            ? team.name
                            : 'No Team'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDoctor(doctor.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
              {doctors.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No doctors added yet
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
