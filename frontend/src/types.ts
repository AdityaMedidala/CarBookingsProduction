export type UserRole = 'employee' | 'admin' | 'approver' | 'driver';

export interface Booking {
  id: number;
  status: string;
  employeeName?: string;
  guestName?: string;
  fromLocation: string;
  toLocation: string;
  startDate: string;
  startTime: string;
  reasonForTravel: string;
  [key: string]: any; 
}

export interface Car {
    id: number;
    carName: string;
    carNumber: string;
    currentKms: number;
    carType: string;
}

export interface ApproverAllocation {
  carId: string;
  startCarAllotted: string;
  startCarNumber: string;
  carType: string;
  approverComments?: string;
}

export interface Rejection {
    adminComments: string;
}

export interface DriverPreTrip {
  startTime: string;
  startKms: number;
}
export interface DriverPostTrip {
  endTime: string;
  endKms: number;
}