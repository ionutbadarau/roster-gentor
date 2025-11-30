'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Doctor, Team, Shift } from '@/types/scheduling';
import { User, Clock, Calendar } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface DoctorViewProps {
  doctors: Doctor[];
  teams: Team[];
  shifts: Shift[];
  selectedDoctor: Doctor | null;
  onDoctorSelect: (doctor: Doctor) => void;
  currentMonth: number;
  currentYear: number;
}

export default function DoctorView({
  doctors,
  teams,
  shifts,
  selectedDoctor,
  onDoctorSelect,
  currentMonth,
  currentYear,
}: DoctorViewProps) {
  const getTeamById = (teamId?: string) => {
    return teams.find((t) => t.id === teamId);
  };

  const getDoctorShifts = (doctorId: string) => {
    return shifts.filter((shift) => shift.doctor_id === doctorId);
  };

  const calculateStats = (doctorShifts: Shift[]) => {
    const dayShifts = doctorShifts.filter((s) => s.shift_type === 'day').length;
    const nightShifts = doctorShifts.filter((s) => s.shift_type === 'night').length;
    const totalHours = dayShifts * 12 + nightShifts * 12;

    return {
      totalShifts: dayShifts + nightShifts,
      dayShifts,
      nightShifts,
      totalHours,
    };
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Doctors
          </CardTitle>
          <CardDescription>Select a doctor to view their schedule</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {doctors.map((doctor) => {
              const team = getTeamById(doctor.team_id);
              const isSelected = selectedDoctor?.id === doctor.id;

              return (
                <button
                  key={doctor.id}
                  onClick={() => onDoctorSelect(doctor)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-accent border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback
                        style={{
                          backgroundColor: team ? `${team.color}30` : undefined,
                          color: team?.color,
                        }}
                      >
                        {getInitials(doctor.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doctor.name}</p>
                      <p className={`text-xs truncate ${isSelected ? 'opacity-90' : 'text-muted-foreground'}`}>
                        {doctor.is_floating ? 'Floating Staff' : team ? team.name : 'No Team'}
                      </p>
                    </div>
                    {team && (
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: team.color }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
            {doctors.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No doctors available. Add doctors in the Configuration tab.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {selectedDoctor ? `${selectedDoctor.name}'s Schedule` : 'Doctor Schedule'}
          </CardTitle>
          <CardDescription>
            {selectedDoctor
              ? `Viewing schedule for ${monthNames[currentMonth]} ${currentYear}`
              : 'Select a doctor to view their schedule'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedDoctor ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(() => {
                  const doctorShifts = getDoctorShifts(selectedDoctor.id);
                  const stats = calculateStats(doctorShifts);
                  const team = getTeamById(selectedDoctor.team_id);

                  return (
                    <>
                      <div className="bg-card border rounded-lg p-4">
                        <p className="text-sm text-muted-foreground mb-1">Total Shifts</p>
                        <p className="text-2xl font-bold">{stats.totalShifts}</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <p className="text-sm text-blue-700 dark:text-blue-300 mb-1">Day Shifts</p>
                        <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                          {stats.dayShifts}
                        </p>
                      </div>
                      <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                        <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-1">Night Shifts</p>
                        <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                          {stats.nightShifts}
                        </p>
                      </div>
                      <div className="bg-card border rounded-lg p-4">
                        <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Total Hours
                        </p>
                        <p className="text-2xl font-bold">{stats.totalHours}h</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div>
                <h4 className="font-semibold mb-3">Shift Details</h4>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {(() => {
                    const doctorShifts = getDoctorShifts(selectedDoctor.id).sort(
                      (a, b) => new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime()
                    );

                    if (doctorShifts.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No shifts scheduled for this month
                        </p>
                      );
                    }

                    return doctorShifts.map((shift) => {
                      const date = new Date(shift.shift_date);
                      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                      const dateStr = date.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      });

                      return (
                        <div
                          key={shift.id}
                          className={`p-3 rounded-lg border ${
                            shift.shift_type === 'day'
                              ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                              : 'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {dayName}, {dateStr}
                              </p>
                              <p
                                className={`text-sm ${
                                  shift.shift_type === 'day'
                                    ? 'text-blue-700 dark:text-blue-300'
                                    : 'text-indigo-700 dark:text-indigo-300'
                                }`}
                              >
                                {shift.shift_type === 'day' ? 'Day Shift' : 'Night Shift'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                {shift.start_time} - {shift.end_time}
                              </p>
                              <p className="text-xs text-muted-foreground">12 hours</p>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Select a doctor from the list to view their schedule
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
