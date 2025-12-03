# Doctor Shift Planning Application

A comprehensive Next.js shift scheduling system that automatically generates monthly calendars for medical staff, managing 12-hour day/night rotations while enforcing mandatory rest periods and team preferences.

## Features

### 1. Configuration Panel
- **Team Management**: Create and manage shift teams with customizable colors and member limits
- **Doctor Management**: Add doctors, assign them to teams, or designate as floating staff
- **Flexible Assignment**: Doctors can be assigned to specific teams or marked as floating to cover any team

### 2. Automated Scheduling Engine
- **Smart Generation**: Automatically generates monthly schedules based on configured teams and doctors
- **Team-Based Rotation**: Assigns shifts by team order, cycling through teams sequentially
- **Rest Period Enforcement**: 
  - 24 hours mandatory rest after day shifts
  - 48 hours mandatory rest after night shifts
- **Hour Equalization**: Balances shift counts across doctors within teams and floating staff
- **Conflict Detection**: Identifies and reports scheduling conflicts and understaffed shifts

### 3. Monthly Calendar View
- **Visual Schedule**: Grid-based calendar showing all shifts for the month
- **Color-Coded Shifts**: 
  - Light blue for day shifts (8:00-20:00)
  - Dark blue for night shifts (20:00-8:00)
- **Team Colors**: Each doctor's shifts display in their team's color
- **Quick Overview**: See shift counts and doctor assignments at a glance

### 4. Individual Doctor View
- **Personal Schedule**: Filter calendar to show individual doctor schedules
- **Statistics Dashboard**: 
  - Total shifts worked
  - Day vs night shift breakdown
  - Total hours worked
- **Shift Details**: Complete list of assigned shifts with times and dates

### 5. Summary Dashboard
- **Coverage Statistics**: Visual progress bars showing day and night shift coverage
- **Team Overview**: See doctor counts and shift assignments per team
- **Conflict Alerts**: Highlighted warnings for scheduling issues
- **Quick Start Guide**: Step-by-step onboarding for new users

## Getting Started

### Initial Setup

1. **Navigate to Configuration Tab**
   - Create teams (e.g., Team Alpha, Team Beta)
   - Assign colors and set maximum members per team

2. **Add Doctors**
   - Enter doctor names and optional email addresses
   - Assign to teams or mark as floating staff
   - Floating staff can cover any team's shifts

3. **Generate Schedule**
   - Go to Calendar tab
   - Click "Generate Schedule" button
   - Review generated shifts and any conflicts

### Using the Application

#### Dashboard Tab
- View overall statistics and coverage metrics
- Monitor scheduling conflicts
- Check team performance
- Follow quick start guide if setting up

#### Calendar Tab
- View monthly schedule grid
- Navigate between months
- Generate new schedules
- See shift distribution across the month

#### Doctors Tab
- Browse all doctors
- Select individual doctors to view their schedules
- Review personal shift statistics
- Check total hours worked

#### Configuration Tab
- Manage teams and doctors
- Add or remove team members
- Adjust team settings
- Configure floating staff

## Technical Details

### Database Schema

**doctors**
- Stores doctor information
- Links to teams
- Tracks floating status
- Stores preferences

**teams**
- Team definitions
- Color coding
- Member limits
- Order field for rotation priority

**shifts**
- Individual shift assignments
- Date and time information
- Shift type (day/night/rest)
- Links to doctors

### Scheduling Rules

1. **Day Shifts**: 8:00 AM - 8:00 PM (12 hours)
2. **Night Shifts**: 8:00 PM - 8:00 AM (12 hours)
3. **Rest After Day Shift**: Minimum 24 hours
4. **Rest After Night Shift**: Minimum 48 hours
5. **Coverage Requirements**: 2 doctors per shift (day and night)

### Team Rotation Logic

The scheduling engine follows a priority-based team rotation:

1. **Team Order**: Teams are assigned shifts based on their `order` field (configurable in the database)
2. **Same Team First**: When assigning a shift, the engine first tries to find an available doctor from the current team in rotation
3. **Next Team Fallback**: If no doctor from the current team is available, it moves to the next team in order
4. **Floating Doctors**: Floating staff are used to fill gaps when no team doctors are available
5. **Hour Equalization**: Within each team and among floating doctors, those with fewer shifts are prioritized to balance workload

### Conflict Types

- **Rest Violations**: Doctor scheduled before required rest period
- **Understaffed**: Fewer than required doctors for a shift
- **Overstaffed**: More doctors than needed (informational)

## Design Philosophy

The application follows a clean, medical-professional aesthetic with:
- Clear visual hierarchy
- Distinct color coding for shift types
- Readable typography
- Quick scanning of schedule information
- Responsive design for all devices

## Technology Stack

- **Framework**: Next.js 14 with App Router
- **Database**: Supabase (PostgreSQL)
- **UI Components**: shadcn/ui with Radix UI
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Type Safety**: TypeScript

## Future Enhancements

Potential features for future development:
- Drag-and-drop shift reassignment
- Doctor availability preferences
- Shift swap requests
- Export schedules to PDF/Excel
- Email notifications
- Mobile app
- Multi-hospital support
- Advanced analytics and reporting
