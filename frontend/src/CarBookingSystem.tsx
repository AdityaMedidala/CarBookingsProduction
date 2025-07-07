// CarBookingSystem.tsx

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, ChevronDown, XCircle, Car, Zap, Star, Ban, BarChart3, TrendingUp, Clock, Users, Calendar, MapPin, Settings, Activity, Target, AlertCircle, PlusCircle, Trash2, HelpCircle, RefreshCw, PowerOff, Loader2, Edit } from 'lucide-react';import { motion, AnimatePresence } from 'framer-motion';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';import { io, Socket } from 'socket.io-client';
import Fuse from 'fuse.js';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- START: MODIFIED CODE (Custom Leaflet Icons) ---
// Use inline SVG for custom markers to avoid issues with image paths.
const createLeafletIcon = (svgColor: string) => {
    return L.divIcon({
        html: `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${svgColor}" width="32px" height="32px">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                <circle cx="12" cy="9.5" r="2" fill="white" />
            </svg>`,
        className: 'bg-transparent border-0',
        iconSize: [32, 32],
        iconAnchor: [16, 32], // Point of the icon which will correspond to marker's location
        popupAnchor: [0, -32] // Point from which the popup should open relative to the iconAnchor
    });
};

const greenIcon = createLeafletIcon('#22c55e'); // Green for 'In-Trip'
const blueIcon = createLeafletIcon('#3b82f6');  // Blue for 'Completed'
// --- END: MODIFIED CODE ---

// --- MODIFICATION: Use dynamic origin for API calls ---
// This will use the current host and port, e.g., http://localhost:5000 or your production domain
const API_BASE_URL = `${window.location.origin}/api`;

// --- DATA TYPES ---
type UserRole = 'employee' | 'admin' | 'approver' | 'driver';

interface Booking {
  id: number;
  status: string;
  employeeName?: string;
  guestName?: string;
  fromLocation: string;
  toLocation: string;
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  tripType?: 'One Way' | 'Round Trip';
  journeyType?: 'Local' | 'Outstation';
  reasonForTravel: string;
  companyName?: string;
  numGuests?: number;
  startCarAllotted?: string;
  startCarNumber?: string;
  carId?: number;
  startKms?: number;
  driverComments?: string;
  adminComments?: string;
  isAdminTrip?: boolean;
  driverStartTime?: string; // For driver's actual start time
  driverEndTime?: string;   // For driver's actual end time
  dropPoint?: string;       // For final drop-off location
  [key: string]: any;
}

interface TrackedCar {
    bookingId: number;
    position: [number, number];
    carName: string;
    status: string; // e.g., 'In-Trip'
}

// --- START: MODIFIED CODE (Added type for completed trips) ---
interface CompletedTripMarker {
    bookingId: number;
    position: [number, number];
    carName: string;
    status: 'Completed';
}
// --- END: MODIFIED CODE ---

interface Car {
    id: number;
    carName: string;
    carNumber: string;
    currentKms: number;
    carType: string;
    isAvailable: boolean;
    status: string;
}

// --- Main TransportBookingSystem Component ---
const TransportBookingSystem: React.FC = () => {
    const [currentUserRole, setCurrentUserRole] = useState<UserRole>('admin');
    const [activeForm, setActiveForm] = useState<'employee' | 'guest'>('employee');
    const [showSuccess, setShowSuccess] = useState(false);
    const [lastSubmission, setLastSubmission] = useState<any>(null);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [cars, setCars] = useState<Car[]>([]);
    const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
    const [selectedBookingDetails, setSelectedBookingDetails] = useState<Booking | null>(null);
    const [showRejectionForm, setShowRejectionForm] = useState(false);
    const [showCarChangeModal, setShowCarChangeModal] = useState(false);
    const [showForceEndModal, setShowForceEndModal] = useState(false);
    const [isTracking, setIsTracking] = useState(false);
    const [currentTrackingId, setCurrentTrackingId] = useState<number | null>(null);
    const locationWatcherId = useRef<number | null>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // --- MODIFICATION: Use dynamic origin for Socket.IO connection ---
        socketRef.current = io(window.location.origin);
        
        socketRef.current.on('connect', () => {
            console.log('Socket connected:', socketRef.current?.id);
            if (currentUserRole === 'admin') {
                socketRef.current?.emit('join-admin-room');
                console.log('Socket joined the admin room.');
            }
        });
        socketRef.current.on('disconnect', () => console.log('User disconnected:', socketRef.current?.id));
        return () => {
            socketRef.current?.disconnect();
        };
    }, [currentUserRole]);

    // --- Utility Functions ---
    const formatTime = (timeInput: string | Date | undefined) => {
    if (!timeInput) return 'N/A';

    let timeStringPart: string;

    if (typeof timeInput === 'string') {
        // If it's a full ISO string (e.g., "2024-05-10T14:00:00.000Z"),
        // extract just the time part. We will treat the time as "local" to the event,
        // ignoring the date and timezone information that comes from serialization.
        const tIndex = timeInput.indexOf('T');
        if (tIndex !== -1) {
            // Get the substring after 'T', e.g., "14:00:00.000Z"
            timeStringPart = timeInput.substring(tIndex + 1);
        } else {
            // It's already a time string like "14:00" or "14:00:00"
            timeStringPart = timeInput;
        }
    } else { // Handle the case where a Date object might be passed
        // Get hours and minutes from the date object directly and format as a string
        const dateObj = timeInput;
        const h = dateObj.getHours();
        const m = dateObj.getMinutes();
        timeStringPart = `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}:00`;
    }

    // Manually parse the time string to avoid timezone conversions
    const parts = timeStringPart.split(':');
    if (parts.length < 2) {
        return 'Invalid Time';
    }

    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) {
        return 'Invalid Time';
    }

    // Format to a 12-hour clock with AM/PM
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // The hour '0' should be '12'
    const minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();

    return `${hours}:${minutesStr} ${ampm}`;
};
    
    const formatDate = (dateString: string | undefined) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // --- Data Fetching Logic ---
    const fetchBookings = async (role?: UserRole) => {
        try {
            // API_BASE_URL is now dynamic
            const response = await fetch(`${API_BASE_URL}/bookings`);
            const data = await response.json();
            const currentRole = role || currentUserRole;
            
            let filteredData = data;

            if (currentRole === 'approver') {
                filteredData = data.filter((b: any) => ['Pending Allocation', 'Change Requested'].includes(b.status));
            } else if (currentRole === 'driver') {
                filteredData = data.filter((b: any) => ['Car Allocated', 'Trip Started'].includes(b.status));
            }
            setBookings(filteredData);
        } catch (error) {
            console.error("Error fetching bookings:", error);
        }
    };

    const fetchCars = async (showAll = true) => {
        try {
             // API_BASE_URL is now dynamic
            const response = await fetch(`${API_BASE_URL}/bookings/cars?showAll=${showAll}`);
            const data = await response.json();
            setCars(data);
        } catch (error) {
            console.error("Error fetching cars:", error);
        }
    };

    const fetchBookingById = async (id: string) => {
        if (!id) {
            setSelectedBookingDetails(null);
            return;
        }
        try {
             // API_BASE_URL is now dynamic
            const response = await fetch(`${API_BASE_URL}/bookings/${id}`);
            const data = await response.json();
            setSelectedBookingDetails(data);
        } catch (error) {
            console.error(`Error fetching booking ${id}:`, error);
            setSelectedBookingDetails(null);
        }
    };
    
    useEffect(() => {
        fetchBookings(currentUserRole);
        fetchCars(true);
        setSelectedBookingId(null);
        setSelectedBookingDetails(null);
        setShowRejectionForm(false);
    }, [currentUserRole]);

    useEffect(() => {
        if (selectedBookingId) {
            fetchBookingById(selectedBookingId);
        } else {
            setSelectedBookingDetails(null);
        }
        setShowRejectionForm(false);
    }, [selectedBookingId]);

    // Geolocation Tracking Logic
    useEffect(() => {
        if (isTracking && currentTrackingId) {
            const trackedBooking = bookings.find(b => b.id === currentTrackingId);
            if (!trackedBooking || !trackedBooking.startCarAllotted) {
                return;
            }

            if (!navigator.geolocation) {
                alert('Geolocation is not supported by your browser.');
                return;
            }

            locationWatcherId.current = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    const locationData: TrackedCar = {
                        bookingId: currentTrackingId,
                        position: [latitude, longitude],
                        carName: trackedBooking.startCarAllotted!,
                        status: 'In-Trip'
                    };

                    if (socketRef.current?.connected) {
                        socketRef.current.emit('update-location', locationData);
                    }
                },
                (error) => console.error('Error getting location:', error),
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        } else {
            if (locationWatcherId.current) {
                navigator.geolocation.clearWatch(locationWatcherId.current);
                locationWatcherId.current = null;
            }
        }

        return () => {
            if (locationWatcherId.current) {
                navigator.geolocation.clearWatch(locationWatcherId.current);
            }
        };
    }, [isTracking, currentTrackingId, bookings]);


    // --- Car Management Handlers ---
    const handleAddCar = async (carData: Omit<Car, 'id' | 'isAvailable' | 'status'>) => {
        try {
            const response = await fetch(`${API_BASE_URL}/bookings/cars`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(carData),
            });
            if (!response.ok) throw new Error('Failed to add car');
            await fetchCars(true);
            alert('Car added successfully!');
        } catch (error) {
            console.error("Error adding car:", error);
            alert('Error adding car.');
        }
    };

    const handleUpdateCarStatus = async (carId: number, status: 'Free' | 'Maintenance') => {
        const confirmMsg = status === 'Free' 
            ? 'Are you sure you want to mark this car as available?'
            : 'Are you sure you want to mark this car for maintenance?';

        if (window.confirm(confirmMsg)) {
            try {
                const response = await fetch(`${API_BASE_URL}/bookings/car/${carId}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status }),
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to update car status');
                }
                await fetchCars(true);
                alert(`Car status updated to ${status}!`);
            } catch (error) {
                console.error("Error updating car status:", error);
                alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    };
    
    // --- START: MODIFIED CODE (LiveTrackingMap component) ---
    interface LiveTrackingMapProps {
        liveCars: TrackedCar[];
        completedTrips: CompletedTripMarker[];
    }

    const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({ liveCars, completedTrips }) => {
        const defaultPosition: [number, number] = [17.385044, 78.486671]; // Default to Hyderabad, India

        return (
            <div className="h-[500px] w-full rounded-xl overflow-hidden shadow-inner border border-gray-200">
                <MapContainer center={defaultPosition} zoom={13} className="h-full w-full">
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    {/* Render live cars with green markers */}
                    {liveCars.map(car => (
                        <Marker key={`live-${car.bookingId}`} position={car.position} icon={greenIcon}>
                            <Popup>
                                <strong>{car.carName} (Live)</strong><br />
                                Booking ID: {car.bookingId}<br />
                                Status: {car.status}<br />
                                Lat: {car.position[0].toFixed(4)}, Lng: {car.position[1].toFixed(4)}
                            </Popup>
                        </Marker>
                    ))}
                    {/* Render completed trips with blue markers */}
                    {completedTrips.map(trip => (
                         <Marker key={`completed-${trip.bookingId}`} position={trip.position} icon={blueIcon}>
                            <Popup>
                                <strong>{trip.carName} (Trip Ended)</strong><br />
                                Booking ID: {trip.bookingId}<br />
                                Status: {trip.status}<br />
                                Drop-off: {trip.position[0].toFixed(4)}, {trip.position[1].toFixed(4)}
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        );
    };
     // --- END: MODIFIED CODE ---

    // --- Statistics Calculations ---
    const getBookingStats = () => {
        const total = bookings.length;
        const pending = bookings.filter(b => b.status === 'Pending Allocation').length;
        const allocated = bookings.filter(b => b.status === 'Car Allocated').length;
        const inProgress = bookings.filter(b => b.status === 'Trip Started').length;
        const completed = bookings.filter(b => b.status === 'Trip Completed').length;
        const rejected = bookings.filter(b => b.status === 'Rejected').length;

        return { total, pending, allocated, inProgress, completed, rejected };
    };

    const getStatusDistribution = () => {
        const stats = getBookingStats();
        return [
            { name: 'Pending', value: stats.pending, color: '#F59E0B' },
            { name: 'Allocated', value: stats.allocated, color: '#3B82F6' },
            { name: 'In Progress', value: stats.inProgress, color: '#8B5CF6' },
            { name: 'Completed', value: stats.completed, color: '#10B981' },
            { name: 'Rejected', value: stats.rejected, color: '#EF4444' }
        ].filter(item => item.value > 0);
    };

    const getMonthlyTrends = () => {
        const monthlyData: { [key: string]: number } = {};
        bookings.forEach(booking => {
            const date = new Date(booking.startDate);
            const monthKey = date.toLocaleString('default', { month: 'short' });
            monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
        });
        
        const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        return monthOrder.map(month => ({
            month,
            bookings: monthlyData[month] || 0
        })).filter(d => d.bookings > 0);
    };
    
    // --- Form Submission Handler ---
    const handleFormSubmit = async (data: any, formType: string) => {
        if (formType === 'driver_start') {
            const bookingId = parseInt(selectedBookingId!, 10);
            setCurrentTrackingId(bookingId);
            setIsTracking(true);
        }

        if (formType === 'driver_end' || formType === 'admin_force_end') {
             setIsTracking(false);
             setCurrentTrackingId(null);
        }

        if (!selectedBookingId && !['employee', 'guest'].includes(formType)) {
             alert('Please select a booking first.');
             return;
        }

        try {
            let endpoint = '';
            let method = 'POST';
            let successMessage = 'Action completed successfully.';

            switch (formType) {
                case 'employee':
                case 'guest':
                    endpoint = `/bookings/${formType}`;
                    successMessage = `${formType.charAt(0).toUpperCase() + formType.slice(1)} booking submitted for allocation!`;
                    break;
                case 'approver_allocate':
                    endpoint = `/bookings/approver/allocate/${selectedBookingId}`;
                    method = 'PUT';
                    successMessage = 'Vehicle Allocated! Notified Driver & Requester.';
                    break;
                case 'approver_reject':
                    endpoint = `/bookings/approver/reject/${selectedBookingId}`;
                    method = 'PUT';
                    successMessage = 'Booking Rejected. Requester has been notified.';
                    setShowRejectionForm(false);
                    break;
                case 'driver_start':
                    endpoint = `/bookings/driver/start-trip/${selectedBookingId}`;
                    method = 'PUT';
                    successMessage = 'Trip Started!';
                    break;
                case 'driver_end':
                    endpoint = `/bookings/driver/end-trip/${selectedBookingId}`;
                    method = 'PUT';
                    successMessage = 'Trip Completed & Car is now available!';
                    break;
                case 'driver_request_change':
                    endpoint = `/bookings/driver/request-change/${selectedBookingId}`;
                    method = 'PUT';
                    successMessage = 'Car change request submitted to admin.';
                    setShowCarChangeModal(false);
                    break;
                case 'admin_force_end':
                    endpoint = `/bookings/admin/booking/${selectedBookingId}/force-end`;
                    method = 'PUT';
                    successMessage = 'Trip has been force-ended by admin.';
                    setShowForceEndModal(false);
                    break;
                default:
                    return;
            }

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.message || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            setLastSubmission({ ...result, message: successMessage });
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 5000);

            fetchBookings(currentUserRole);
            fetchCars(true);
            setSelectedBookingId(null);

        } catch (error: unknown) {
             let errorMessage = 'An unexpected error occurred.';
             if (error instanceof Error) {
                 errorMessage = error.message;
             }
             alert(`Error: ${errorMessage}`);
             setShowSuccess(false);
        }
    };

    // --- Dashboard Components ---
    const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: string; trend?: string }> = 
        ({ title, value, icon, color, trend }) => (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
        >
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                    <p className="text-3xl font-bold text-gray-800">{value}</p>
                    {trend && <p className="text-xs text-green-600 flex items-center mt-1">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        {trend}
                    </p>}
                </div>
                <div className={`p-3 rounded-full ${color}`}>
                    {icon}
                </div>
            </div>
        </motion.div>
    );

    const AdminDashboard = () => {
        const stats = getBookingStats();
        const statusData = getStatusDistribution();
        const monthlyData = getMonthlyTrends();
        const [trackedCars, setTrackedCars] = useState<TrackedCar[]>([]);
        // --- START: MODIFIED CODE (State for completed trips) ---
        const [completedTrips, setCompletedTrips] = useState<CompletedTripMarker[]>([]);
        // --- END: MODIFIED CODE ---
        const [searchQuery, setSearchQuery] = useState('');
        
        const fuse = new Fuse(trackedCars, {
            keys: ['carName', 'bookingId', 'status'],
            threshold: 0.3,
        });

        const searchResults = searchQuery ? fuse.search(searchQuery).map(result => result.item) : trackedCars;

        // --- START: MODIFIED CODE (Socket listeners for map updates) ---
        useEffect(() => {
            const handleLocationUpdate = (data: TrackedCar) => {
                setTrackedCars(prevCars => {
                    const existingCarIndex = prevCars.findIndex(c => c.bookingId === data.bookingId);
                    if (existingCarIndex > -1) {
                        const updatedCars = [...prevCars];
                        updatedCars[existingCarIndex] = data;
                        return updatedCars;
                    }
                    return [...prevCars, data];
                });
            };

            const handleTripCompletion = (data: { bookingId: number; dropPoint: string; carName: string; }) => {
    // Remove the car from the live tracking array
    setTrackedCars(prevCars => prevCars.filter(c => c.bookingId !== data.bookingId));

    //
    // --- START: MODIFIED LOGIC ---
    //
    if (data.dropPoint) {
        // Parse the dropPoint string "Lat: xx.xxxx, Lng: yy.yyyy" into coordinates
        const coordsMatch = data.dropPoint.match(/Lat: ([-.\d]+), Lng: ([-.\d]+)/);
        
        if (coordsMatch && coordsMatch.length === 3) {
            const lat = parseFloat(coordsMatch[1]);
            const lng = parseFloat(coordsMatch[2]);
            
            // Add a new marker to the completed trips array
            const newCompletedTrip: CompletedTripMarker = {
                bookingId: data.bookingId,
                position: [lat, lng],
                carName: data.carName,
                status: 'Completed'
            };
            setCompletedTrips(prev => [...prev.filter(t => t.bookingId !== data.bookingId), newCompletedTrip]);
        } else {
            console.error(`Could not parse dropPoint for booking ${data.bookingId}:`, data.dropPoint);
        }
    } else {
         console.error(`Received trip completion for booking ${data.bookingId} but no dropPoint was provided.`);
    }
    //
    // --- END: MODIFIED LOGIC ---
    //
};

            socketRef.current?.on('location-update', handleLocationUpdate);
            socketRef.current?.on('location-update-complete', handleTripCompletion);

            return () => {
                socketRef.current?.off('location-update', handleLocationUpdate);
                socketRef.current?.off('location-update-complete', handleTripCompletion);
            };
        }, []);
        // --- END: MODIFIED CODE ---

        // --- START: MODIFIED CODE (Quick Car Status Update Form) ---
        const QuickUpdateCarForm: React.FC = () => {
            const [selectedCarId, setSelectedCarId] = useState('');
            const [newStatus, setNewStatus] = useState<'Free' | 'Maintenance'>('Free');

            const handleSubmit = (e: React.FormEvent) => {
                e.preventDefault();
                if (!selectedCarId) {
                    alert('Please select a car.');
                    return;
                }
                handleUpdateCarStatus(parseInt(selectedCarId), newStatus);
                setSelectedCarId(''); // Reset form
            };

            return (
                <form onSubmit={handleSubmit} className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                    <SystemSelect 
                        label="Select a Car"
                        name="quickUpdateCarId"
                        value={selectedCarId}
                        onChange={(e) => setSelectedCarId(e.target.value)}
                        options={cars.map(c => ({ value: c.id.toString(), label: `${c.carName} (${c.carNumber})` }))}
                    />
                     <SystemRadioGroup
                        label="Set Status"
                        name="newStatus"
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value as 'Free' | 'Maintenance')}
                        options={['Free', 'Maintenance']}
                    />
                    <button type="submit" className="w-full bg-gradient-to-r from-sky-500 to-blue-500 text-white py-2 px-4 rounded-lg hover:from-sky-600 hover:to-blue-600 transition-colors font-semibold flex items-center justify-center">
                        <Edit className="w-4 h-4 mr-2" /> Update Status
                    </button>
                </form>
            );
        };
        // --- END: MODIFIED CODE ---

        return (
            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard title="Total Bookings" value={stats.total} icon={<Calendar className="w-6 h-6 text-indigo-500" />} color="bg-indigo-100" trend="+12% from last month" />
                    <StatCard title="Pending Requests" value={stats.pending} icon={<Clock className="w-6 h-6 text-amber-500" />} color="bg-amber-100" />
                    <StatCard title="Active Trips" value={stats.inProgress} icon={<Car className="w-6 h-6 text-sky-500" />} color="bg-sky-100" />
                    <StatCard title="Available Cars" value={cars.filter(c => c.isAvailable).length} icon={<CheckCircle className="w-6 h-6 text-emerald-500" />} color="bg-emerald-100" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 lg:col-span-1">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center"><BarChart3 className="w-5 h-5 mr-2 text-indigo-600" />Booking Status</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                                    {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 justify-center">
                            {statusData.map((entry, index) => (
                                <div key={index} className="flex items-center"><div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: entry.color }}></div><span className="text-sm text-gray-600">{entry.name} ({entry.value})</span></div>
                            ))}
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 lg:col-span-2">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center"><TrendingUp className="w-5 h-5 mr-2 text-emerald-600" />Monthly Booking Trends</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={monthlyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                                <YAxis stroke="#6b7280" fontSize={12} />
                                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.75rem' }} />
                                <Bar dataKey="bookings" fill="url(#colorGradient)" radius={[4, 4, 0, 0]} />
                                <defs><linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0.8}/></linearGradient></defs>
                            </BarChart>
                        </ResponsiveContainer>
                    </motion.div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden lg:col-span-3">
                        <div className="p-6 border-b border-gray-200"><h3 className="text-lg font-semibold text-gray-800 flex items-center"><Activity className="w-5 h-5 mr-2 text-sky-600" />Recent Bookings</h3></div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requester</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {bookings.slice(0, 10).map((booking) => (
                                        <tr key={booking.id} className={`hover:bg-gray-100/50 transition-colors cursor-pointer ${selectedBookingId === booking.id.toString() ? 'bg-indigo-50' : ''}`} onClick={() => setSelectedBookingId(booking.id.toString())}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-medium">{booking.employeeName || booking.guestName}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{booking.fromLocation} → {booking.toLocation}</td>
                                            <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={booking.status} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                    
                    <div className="lg:col-span-2 space-y-6">
                        {renderBookingDetailsCard()}
                         {selectedBookingDetails && ['Pending Allocation', 'Change Requested'].includes(selectedBookingDetails.status) && (
                            <ApproverActions key={`admin-actions-${selectedBookingId}`} cars={cars} showRejectionForm={showRejectionForm} setShowRejectionForm={setShowRejectionForm} handleFormSubmit={handleFormSubmit} />
                        )}
                    </div>
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 mt-8">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center"><Car className="w-6 h-6 mr-3 text-indigo-600" />Manage Car Fleet</h2>
                     {/* --- START: MODIFIED CODE (Car Management Section) --- */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-700 mb-4">Add New Car</h3>
                                <AddCarForm onSubmit={handleAddCar} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-700 mb-4 mt-6">Quick Update</h3>
                                <QuickUpdateCarForm />
                            </div>
                        </div>
                        <div className="lg:col-span-2">
                            <h3 className="text-lg font-semibold text-gray-700 mb-4">Car Fleet Status</h3>
                            <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                {cars.map(car => (
                                    <div key={car.id} className={`flex items-center justify-between p-3 rounded-xl border ${car.isAvailable ? 'bg-white' : 'bg-gray-100'}`}>
                                        <div className="flex items-center">
                                            <div className={`w-2.5 h-2.5 rounded-full mr-3 ${car.isAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                                            <div>
                                                <p className="font-semibold text-gray-800">{car.carName} <span className="text-sm font-normal text-gray-500">({car.carType})</span></p>
                                                <p className="text-sm text-gray-600">{car.carNumber} - {car.currentKms.toLocaleString()} KMs</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${car.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{car.status}</span>
                                            {car.status === 'Maintenance' && (
                                                <button onClick={() => handleUpdateCarStatus(car.id, 'Free')} className="text-emerald-500 hover:text-emerald-700 p-2 rounded-full hover:bg-emerald-100 transition-colors" aria-label={`Make ${car.carName} available`}><RefreshCw className="w-4 h-4" /></button>
                                            )}
                                            {car.status !== 'Maintenance' && (
                                                <button onClick={() => handleUpdateCarStatus(car.id, 'Maintenance')} className="text-rose-500 hover:text-rose-700 p-2 rounded-full hover:bg-rose-100 transition-colors" aria-label={`Mark ${car.carName} for maintenance`}><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                     {/* --- END: MODIFIED CODE --- */}
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 mt-8">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Live Fleet Tracking</h3>
<div className="text-sm text-gray-600 mb-6 flex items-center gap-6">                        <span className="flex items-center"><div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#22c55e' }}></div> In-Trip Vehicle</span>
                        <span className="flex items-center"><div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#3b82f6' }}></div> Completed Trip</span>
                    </div>
                    <div className="mb-4"><SystemInput label="Search Live Cars (by Name, ID, or Status)" type="text" name="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="e.g., Toyota, In-Trip, 101" /></div>
                    {/* --- START: MODIFIED CODE (Passing both car sets to map) --- */}
                    <LiveTrackingMap liveCars={searchResults} completedTrips={completedTrips} />
                    {/* --- END: MODIFIED CODE --- */}
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 mt-8">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center"><PlusCircle className="w-6 h-6 mr-3 text-emerald-600" />Create New Booking</h2>
                    {renderRequesterPortal()}
                </motion.div>
            </div>
        );
    };

    const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
        const getStatusConfig = (status: string) => {
            switch (status) {
                case 'Pending Allocation': return { color: 'bg-amber-100 text-amber-800', icon: Clock };
                case 'Car Allocated': return { color: 'bg-sky-100 text-sky-800', icon: Car };
                case 'Trip Started': return { color: 'bg-indigo-100 text-indigo-800', icon: Zap };
                case 'Trip Completed': return { color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle };
                case 'Rejected': return { color: 'bg-rose-100 text-rose-800', icon: XCircle };
                case 'Change Requested': return { color: 'bg-yellow-100 text-yellow-800', icon: HelpCircle };
                default: return { color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
            }
        };
        const config = getStatusConfig(status);
        const Icon = config.icon;
        return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}><Icon className="w-3 h-3 mr-1.5" />{status}</span>;
    };

    const renderBookingDetailsCard = () => (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 min-h-[200px]">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2 text-indigo-600" />
                Booking Details
            </h3>
            <AnimatePresence mode="wait">
            {selectedBookingDetails ? (
                 <motion.div key={selectedBookingDetails.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 p-4 bg-gradient-to-r from-gray-50 to-gray-100/60 rounded-xl border border-gray-200 overflow-hidden">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center justify-between">
                        Booking #{selectedBookingDetails.id}
                        <StatusBadge status={selectedBookingDetails.status} />
                    </h4>
                    <div className="space-y-2.5 text-sm">
                        <p className="flex items-center"><Users className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" /><span className="font-medium text-gray-600 mr-2">Requester:</span><span className="text-gray-800 truncate">{selectedBookingDetails.employeeName || selectedBookingDetails.guestName}</span></p>
                        <p className="flex items-center"><MapPin className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" /><span className="font-medium text-gray-600 mr-2">Journey:</span><span className="text-gray-800">{selectedBookingDetails.fromLocation} → {selectedBookingDetails.toLocation}</span></p>
                        <p className="flex items-center"><Calendar className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" /><span className="font-medium text-gray-600 mr-2">Trip:</span><span className="text-gray-800">{selectedBookingDetails.tripType} ({selectedBookingDetails.journeyType})</span></p>
                        <p className="flex items-center"><Clock className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" /><span className="font-medium text-gray-600 mr-2">Scheduled:</span><span className="text-gray-800">{formatDate(selectedBookingDetails.startDate)} at {formatTime(selectedBookingDetails.startTime)}</span></p>
                        {selectedBookingDetails.tripType === 'Round Trip' && <p className="flex items-center"><Clock className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" /><span className="font-medium text-gray-600 mr-2">End:</span><span className="text-gray-800">{formatDate(selectedBookingDetails.endDate)} at {formatTime(selectedBookingDetails.endTime)}</span></p>}
                        
                        { (selectedBookingDetails.status.includes('Allocated') || selectedBookingDetails.status.includes('Trip') || selectedBookingDetails.status.includes('Completed')) && selectedBookingDetails.startCarAllotted && (
                            <p className="flex items-center pt-2 border-t border-gray-200 mt-2">
                                <Car className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" />
                                <span className="font-medium text-gray-600 mr-2">Assigned Car:</span>
                                <span className="text-gray-800">{selectedBookingDetails.startCarAllotted} ({selectedBookingDetails.startCarNumber})</span>
                            </p>
                        )}

                        {selectedBookingDetails.driverStartTime && (
                            <p className="flex items-center"><Zap className="w-4 h-4 mr-2 text-emerald-500" /><span className="font-medium text-gray-600 mr-2">Trip Started At:</span><span className="text-emerald-700 font-semibold">{formatTime(selectedBookingDetails.driverStartTime)}</span></p>
                        )}
                        {selectedBookingDetails.status === 'Trip Completed' && selectedBookingDetails.driverEndTime && (
                             <p className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-indigo-500" /><span className="font-medium text-gray-600 mr-2">Trip Ended At:</span><span className="text-indigo-700 font-semibold">{formatTime(selectedBookingDetails.driverEndTime)}</span></p>
                        )}
                        {selectedBookingDetails.status === 'Trip Completed' && selectedBookingDetails.dropPoint && (
                             <p className="flex items-center"><MapPin className="w-4 h-4 mr-2 text-indigo-500" /><span className="font-medium text-gray-600 mr-2">Drop-off Point:</span><span className="text-gray-800">{selectedBookingDetails.dropPoint}</span></p>
                        )}
                        
                        {selectedBookingDetails.status === 'Change Requested' && selectedBookingDetails.driverComments && (
                            <p className="flex items-start pt-2 border-t border-yellow-200 mt-2 text-yellow-900 bg-yellow-50 p-2 rounded-md">
                                <HelpCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                                <span className="font-medium">Change Reason: {selectedBookingDetails.driverComments}</span>
                            </p>
                        )}
                        {selectedBookingDetails.adminComments && (
                             <p className="flex items-start pt-2 border-t border-gray-200 mt-2 text-gray-900 bg-gray-100 p-2 rounded-md">
                                <Settings className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                                <span className="font-medium">Admin Notes: {selectedBookingDetails.adminComments}</span>
                            </p>
                        )}
                        {currentUserRole === 'admin' && ['Car Allocated', 'Trip Started'].includes(selectedBookingDetails.status) && (
                            <div className="pt-3 mt-3 border-t border-gray-200">
                                <button onClick={() => setShowForceEndModal(true)} className="w-full bg-gradient-to-r from-red-500 to-orange-500 text-white py-2 px-4 rounded-lg hover:from-red-600 hover:to-orange-600 transition-all duration-200 font-medium flex items-center justify-center">
                                    <PowerOff className="w-4 h-4 mr-2" /> Force End Trip
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            ) : (
                <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center h-full text-center text-gray-500 mt-8">
                    <p>Select a booking from the list to see details.</p>
                </motion.div>
            )}
            </AnimatePresence>
        </motion.div>
    );

    const renderRequesterPortal = () => (
        <div>
            <div className="flex border-b border-gray-200 mb-8">
                <button onClick={() => setActiveForm('employee')} className={`py-3 px-6 text-sm font-medium transition-all duration-200 ${activeForm === 'employee' ? "border-b-2 border-indigo-500 text-indigo-600 bg-indigo-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"} rounded-t-lg`}>Employee Booking</button>
                <button onClick={() => setActiveForm('guest')} className={`py-3 px-6 text-sm font-medium transition-all duration-200 ${activeForm === 'guest' ? "border-b-2 border-indigo-500 text-indigo-600 bg-indigo-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"} rounded-t-lg`}>Guest Booking</button>
            </div>
            {activeForm === 'employee' && <BookingForm key="employee" formType="employee" onSubmit={(data) => handleFormSubmit(data, 'employee')} />}
            {activeForm === 'guest' && <BookingForm key="guest" formType="guest" onSubmit={(data) => handleFormSubmit(data, 'guest')} />}
        </div>
    );

    const renderAdminPortal = () => <AdminDashboard />;

    const renderApproverPortal = () => (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3">
                <SystemSelect
                    label="Choose Booking to Review"
                    name="bookingId"
                    value={selectedBookingId || ''}
                    onChange={(e) => setSelectedBookingId(e.target.value)}
                    options={[{ value: '', label: 'Select a booking...' }, ...bookings.map(booking => ({ value: booking.id.toString(), label: `ID: ${booking.id} - ${booking.employeeName || booking.guestName} (${booking.status})`}))]}
                />
                {renderBookingDetailsCard()}
            </div>
            <div className="lg:col-span-2">
            {selectedBookingDetails && ['Pending Allocation', 'Change Requested'].includes(selectedBookingDetails.status) && (
                 <ApproverActions key={`approver-actions-${selectedBookingId}`} cars={cars} showRejectionForm={showRejectionForm} setShowRejectionForm={setShowRejectionForm} handleFormSubmit={handleFormSubmit} />
            )}
            </div>
        </div>
    );

    const renderDriverPortal = () => {
        const selectedBooking = bookings.find(b => b.id.toString() === selectedBookingId);
        return (
            <>
            <AnimatePresence>
            {showCarChangeModal && (
                <CarChangeRequestModal 
                    onClose={() => setShowCarChangeModal(false)} 
                    onSubmit={(data) => handleFormSubmit(data, 'driver_request_change')}
                />
            )}
            </AnimatePresence>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3">
                    <SystemSelect
                        label="Choose Your Assigned Trip"
                        name="bookingId"
                        value={selectedBookingId || ''}
                        onChange={(e) => setSelectedBookingId(e.target.value)}
                        options={[{ value: '', label: 'Select a trip...' }, ...bookings.map(booking => ({ value: booking.id.toString(), label: `ID: ${booking.id} - ${booking.fromLocation} to ${booking.toLocation}`}))]}
                    />
                    {renderBookingDetailsCard()}
                </div>
                <div className="lg:col-span-2">
                    {selectedBookingId && selectedBooking?.status === 'Car Allocated' && 
                        <div className="space-y-4">
                            <DriverPreTripForm key={`pretrip-${selectedBookingId}`} booking={selectedBooking} onSubmit={(data) => handleFormSubmit(data, 'driver_start')} />
                            <button onClick={() => setShowCarChangeModal(true)} className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3 px-6 rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all duration-200 font-medium flex items-center justify-center">
                                <HelpCircle className="w-5 h-5 mr-2" /> Request Car Change
                            </button>
                        </div>
                    }
                    {selectedBookingId && selectedBooking?.status === 'Trip Started' && 
                        <DriverPostTripForm 
                            key={`posttrip-${selectedBookingId}`} 
                            booking={selectedBooking} 
                            onSubmit={(data) => handleFormSubmit(data, 'driver_end')} 
                            setIsTracking={setIsTracking}
                        />
                    }
                </div>
            </div>
            </>
        );
    };

    // --- FORM COMPONENTS ---
    const SystemSelect: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: { value: string; label: string, disabled?: boolean }[]; required?: boolean; }> = ({ label, name, value, onChange, options, required = false }) => (
       <div className="mb-4">
           <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
           <div className="relative"><select name={name} value={value} onChange={onChange} required={required} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none bg-white"><option value="">Select...</option>{options.map((option) => (<option key={option.value} value={option.value} disabled={option.disabled} className={option.disabled ? 'text-gray-400 bg-gray-100' : ''}>{option.label}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none w-5 h-5" /></div>
       </div>
    );

    const SystemInput: React.FC<{ label: string; type: string; name: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean; placeholder?: string; min?: number; }> = ({ label, type, name, value, onChange, required = false, placeholder, min }) => (
       <div className="mb-4">
           <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
           <input type={type} name={name} value={value} onChange={onChange} required={required} placeholder={placeholder} min={min} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
       </div>
    );

    const SystemTextarea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; required?: boolean; placeholder?: string; }> = ({ label, name, value, onChange, required = false, placeholder }) => (
       <div className="mb-4">
           <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
           <textarea name={name} value={value} onChange={onChange} required={required} placeholder={placeholder} rows={3} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none" />
       </div>
    );
    
    const SystemRadioGroup: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; options: string[]; required?: boolean }> = ({ label, name, value, onChange, options, required = true }) => (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex flex-wrap gap-4">
                {options.map(option => (
                    <label key={option} className="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" name={name} value={option} checked={value === option} onChange={onChange} required={required} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300" />
                        <span className="text-sm text-gray-700">{option}</span>
                    </label>
                ))}
            </div>
        </div>
    );

    const useForm = (initialState: any) => {
        const [formData, setFormData] = useState(initialState);
        const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
            const { name, value, type } = e.target;
            const isNumberInput = type === 'number';
            setFormData({ ...formData, [name]: isNumberInput ? (value === '' ? '' : Number(value)) : value });
        };
        const resetForm = () => setFormData(initialState);
        return { formData, setFormData, handleChange, resetForm };
    };

    const BookingForm: React.FC<{ formType: 'employee' | 'guest', onSubmit: (data: any) => void }> = ({ formType, onSubmit }) => {
       const isEmployee = formType === 'employee';
       const initialState = {
           employeeName: '', employeeId: '', guestName: '', contactNumber: '', guestEmail: '', companyName: '',
           fromLocation: '', toLocation: '', startDate: '', startTime: '', endDate: '', endTime: '',
           tripType: 'One Way', journeyType: 'Local', reasonForTravel: '', numGuests: ''
       };
       const { formData, setFormData, handleChange, resetForm } = useForm(initialState);

       useEffect(() => {
            if (formData.tripType === 'One Way') {
                setFormData((prev: typeof initialState) => ({ ...prev, endDate: '', endTime: '' }));
            }
        }, [formData.tripType, setFormData]);

       const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(formData); resetForm(); };

       return (
           <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {isEmployee ? (
                        <>
                            <SystemInput label="Employee Name" type="text" name="employeeName" value={formData.employeeName} onChange={handleChange} required placeholder="Enter your full name" />
                            <SystemInput label="Employee ID" type="text" name="employeeId" value={formData.employeeId} onChange={handleChange} required placeholder="Enter your employee ID" />
                        </>
                    ) : (
                        <>
                            <SystemInput label="Guest Name" type="text" name="guestName" value={formData.guestName} onChange={handleChange} required placeholder="Enter guest's full name" />
                            <SystemInput label="Phone Number" type="tel" name="contactNumber" value={formData.contactNumber} onChange={handleChange} required placeholder="Guest's contact number" />
                            <SystemInput label="Email Address" type="email" name="guestEmail" value={formData.guestEmail} onChange={handleChange} required placeholder="Guest's email address" />
                            <SystemInput label="Company Name" type="text" name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Guest's company" />
                        </>
                    )}
                    <SystemInput label="From Location" type="text" name="fromLocation" value={formData.fromLocation} onChange={handleChange} required placeholder="e.g., Office, Gachibowli" />
                    <SystemInput label="To Location" type="text" name="toLocation" value={formData.toLocation} onChange={handleChange} required placeholder="e.g., Airport, Shamshabad" />
                    <SystemInput label="Number of Passengers (Optional)" type="number" name="numGuests" value={formData.numGuests} onChange={handleChange} placeholder="e.g., 2" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4 pt-4 border-t border-gray-200">
                    <SystemRadioGroup label="Trip Type" name="tripType" value={formData.tripType} onChange={handleChange} options={['One Way', 'Round Trip']} />
                    <SystemRadioGroup label="Journey Type" name="journeyType" value={formData.journeyType} onChange={handleChange} options={['Local', 'Outstation']} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 mt-4">
                    <SystemInput label="Start Date" type="date" name="startDate" value={formData.startDate} onChange={handleChange} required />
                    <SystemInput label="Start Time" type="time" name="startTime" value={formData.startTime} onChange={handleChange} required />
                    <AnimatePresence>
                    {formData.tripType === 'Round Trip' && (
                        <>
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                <SystemInput label="End Date" type="date" name="endDate" value={formData.endDate} onChange={handleChange} required={formData.tripType === 'Round Trip'} />
                            </motion.div>
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                <SystemInput label="End Time" type="time" name="endTime" value={formData.endTime} onChange={handleChange} required={formData.tripType === 'Round Trip'} />
                            </motion.div>
                        </>
                    )}
                    </AnimatePresence>
                </div>

               <div className="mt-4 pt-4 border-t border-gray-200"><SystemTextarea label="Reason for Travel" name="reasonForTravel" value={formData.reasonForTravel} onChange={handleChange} required placeholder="Please explain the purpose of your trip" /></div>
               <button type="submit" className={`w-full mt-6 text-white py-3 px-6 rounded-lg transition-all duration-200 font-semibold flex items-center justify-center shadow-md hover:shadow-lg ${isEmployee ? 'bg-gradient-to-r from-indigo-500 to-sky-500 hover:from-indigo-600 hover:to-sky-600' : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600'}`}>
                   <Car className="w-5 h-5 mr-2" /> Submit {isEmployee ? 'Employee' : 'Guest'} Booking
               </button>
           </motion.form>
       );
    };

    const ApproverActions: React.FC<{ cars: Car[]; showRejectionForm: boolean; setShowRejectionForm: (show: boolean) => void; handleFormSubmit: (data: any, formType: string) => void; }> = ({ cars, showRejectionForm, setShowRejectionForm, handleFormSubmit }) => {
        const [allocationData, setAllocationData] = useState({ carId: '', startCarAllotted: '', startCarNumber: '', carType: '', approverComments: '' });
        const [rejectionData, setRejectionData] = useState({ adminComments: '' });
        const [isSubmitting, setIsSubmitting] = useState(false); 
        
         const handleCarSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
             const carId = e.target.value;
             const selectedCar = cars.find(car => car.id.toString() === carId);
             if (selectedCar) {
                 setAllocationData(prev => ({ ...prev, carId, startCarAllotted: selectedCar.carName, startCarNumber: selectedCar.carNumber, carType: selectedCar.carType }));
             } else {
                  setAllocationData(prev => ({ ...prev, carId: '', startCarAllotted: '', startCarNumber: '', carType: '' }));
             }
         };

        const handleRejectionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectionData({ ...rejectionData, [e.target.name]: e.target.value });

        const handleAllocate = async (e: React.FormEvent) => { 
            e.preventDefault(); 
            setIsSubmitting(true);
            try {
                await handleFormSubmit(allocationData, 'approver_allocate'); 
            } finally {
                setIsSubmitting(false);
            }
        };

        const handleReject = async (e: React.FormEvent) => { 
            e.preventDefault(); 
            setIsSubmitting(true);
            try {
                await handleFormSubmit(rejectionData, 'approver_reject');
            } finally {
                setIsSubmitting(false);
            }
        };

        const carOptions = cars.map(car => ({
             value: car.id.toString(),
             label: `${car.carName} (${car.carNumber}) - ${car.status}`,
             disabled: !car.isAvailable
        }));

        return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center"><Star className="w-5 h-5 mr-2 text-yellow-400" />Approver Actions</h3>
                <div className="space-y-6">
                    <form onSubmit={handleAllocate} className="space-y-4">
                        <h4 className="font-medium text-gray-700 flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-emerald-500" />Allocate Vehicle</h4>
                        <SystemSelect label="Select Car (Unavailable cars are greyed out)" name="carId" value={allocationData.carId} onChange={handleCarSelection} required options={carOptions} />
                        <button type="submit" disabled={isSubmitting || !allocationData.carId} className="w-full bg-gradient-to-r from-emerald-500 to-green-500 text-white py-2 px-6 rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all duration-200 font-medium flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {isSubmitting ? 'Allocating...' : 'Allocate Vehicle'}
                        </button>
                    </form>
                    <div className="pt-4 border-t border-gray-200">
                        {!showRejectionForm ? (
                            <button onClick={() => setShowRejectionForm(true)} disabled={isSubmitting} className="w-full bg-gradient-to-r from-rose-500 to-red-500 text-white py-2 px-6 rounded-lg hover:from-rose-600 hover:to-red-600 transition-all duration-200 font-medium flex items-center justify-center disabled:opacity-50">
                                <Ban className="w-4 h-4 mr-2" />
                                Reject Request
                            </button>
                        ) : (
                            <form onSubmit={handleReject} className="space-y-4">
                                <h4 className="font-medium text-gray-700 flex items-center"><XCircle className="w-4 h-4 mr-2 text-rose-500" />Reject Request</h4>
                                <SystemTextarea label="Rejection Reason" name="adminComments" value={rejectionData.adminComments} onChange={handleRejectionChange} required placeholder="Provide a reason for rejection" />
                                <div className="flex space-x-3">
                                    <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-rose-500 to-red-500 text-white py-2 px-4 rounded-lg hover:from-rose-600 hover:to-red-600 transition-all duration-200 font-medium flex items-center justify-center disabled:opacity-50">
                                        <XCircle className="w-4 h-4 mr-2" />
                                        {isSubmitting ? 'Confirming...' : 'Confirm'}
                                    </button>
                                    <button type="button" onClick={() => setShowRejectionForm(false)} className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-all duration-200 font-medium">Cancel</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </motion.div>
        );
    };

    const AddCarForm: React.FC<{ onSubmit: (data: Omit<Car, 'id' | 'isAvailable' | 'status'>) => void }> = ({ onSubmit }) => {
        const initialState = { carName: '', carNumber: '', currentKms: '', carType: '' };
        const { formData, handleChange, resetForm } = useForm(initialState);
        const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(formData); resetForm(); };
        return (
            <form onSubmit={handleSubmit} className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                <SystemInput label="Car Name" type="text" name="carName" value={formData.carName} onChange={handleChange} required placeholder="e.g., Toyota Innova" />
                <SystemInput label="Car Number" type="text" name="carNumber" value={formData.carNumber} onChange={handleChange} required placeholder="e.g., TS07 AB 1234" />
                <SystemInput label="Current KMs" type="number" name="currentKms" value={formData.currentKms} onChange={handleChange} required />
                <SystemSelect label="Car Type" name="carType" value={formData.carType} onChange={handleChange} required options={[{ value: 'Sedan', label: 'Sedan' }, { value: 'SUV', label: 'SUV' }, { value: 'Hatchback', label: 'Hatchback' }, { value: 'Van', label: 'Van' }]} />
                <button type="submit" className="w-full bg-gradient-to-r from-indigo-500 to-sky-500 text-white py-2 px-4 rounded-lg hover:from-indigo-600 hover:to-sky-600 transition-colors font-semibold flex items-center justify-center"><PlusCircle className="w-5 h-5 mr-2" />Add Car</button>
            </form>
        );
    };
    
    const getLocationWithFallback = (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                return reject(new Error('Geolocation is not supported.'));
            }

            // 1. Try with high accuracy first
            navigator.geolocation.getCurrentPosition(
                (position) => resolve(position),
                (err) => {
                    console.warn(`High accuracy geolocation failed (${err.message}), trying low accuracy.`);
                    // 2. If high accuracy fails, fall back to low accuracy
                    navigator.geolocation.getCurrentPosition(
                        (position) => resolve(position),
                        (err) => {
                            console.error(`Low accuracy geolocation also failed:`, err);
                            reject(err); // Both failed, reject the promise
                        },
                        { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 }
                    );
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    };

    const DriverPreTripForm: React.FC<{ booking: Booking; onSubmit: (data: any) => void; }> = ({ booking, onSubmit }) => {
       const initialState = { 
           startTime: '', 
           startKms: booking.startKms || '',
           startPoint: '' 
       };
       const { formData, handleChange } = useForm(initialState);
       const [isFetchingLocation, setIsFetchingLocation] = useState(false);
       const [locationError, setLocationError] = useState(false);

       const handleSubmit = async (e: React.FormEvent) => { 
           e.preventDefault(); 
           setIsFetchingLocation(true);
           setLocationError(false);

           try {
               const position = await getLocationWithFallback();
               const { latitude, longitude } = position.coords;
               const locationString = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
               const submissionData = { ...formData, startPoint: locationString };
               onSubmit(submissionData);
           } catch (error) {
               alert("Could not get your location automatically. Please enter it manually.");
               setLocationError(true);
           } finally {
               setIsFetchingLocation(false);
           }
       };

        const handleManualSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (!formData.startPoint) {
                alert('Please enter the starting location.');
                return;
            }
            onSubmit(formData);
        }

       return (
            <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={locationError ? handleManualSubmit : handleSubmit} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center"><Zap className="w-5 h-5 mr-2 text-emerald-500" />Start Trip</h3>
                
                <SystemInput label="Start Time" type="time" name="startTime" value={formData.startTime} onChange={handleChange} required />
                <SystemInput label="Starting Kilometers" type="number" name="startKms" value={formData.startKms} onChange={handleChange} required placeholder="Current odometer reading" />
                
                <AnimatePresence>
                    {locationError && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            <SystemInput
                                label="Manual Start Point"
                                name="startPoint"
                                value={formData.startPoint}
                                type="text"
                                onChange={handleChange}
                                required
                                placeholder="e.g., Pickup at Office Lobby"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                <button type="submit" disabled={isFetchingLocation} className="w-full bg-gradient-to-r from-emerald-500 to-green-500 text-white py-3 px-6 rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all duration-200 font-semibold flex items-center justify-center mt-4 shadow-md hover:shadow-lg disabled:opacity-60">
                    {isFetchingLocation ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Zap className="w-5 h-5 mr-2" />}
                    {isFetchingLocation ? 'Getting Location...' : (locationError ? 'Submit Manual Location' : 'Start Trip')}
                </button>
            </motion.form>
       );
    };

    const DriverPostTripForm: React.FC<{ 
        booking: Booking; 
        onSubmit: (data: any) => void; 
        setIsTracking: (isTracking: boolean) => void;
    }> = ({ booking, onSubmit, setIsTracking }) => {
        const initialState = { endTime: '', endKms: booking.startKms || 0, carId: booking.carId!, dropPoint: '' };
        const { formData, handleChange } = useForm(initialState);
        const [isFetchingLocation, setIsFetchingLocation] = useState(false);
        const [locationError, setLocationError] = useState(false);

        const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!formData.endKms || formData.endKms <= (booking.startKms || 0)) {
                alert('Ending kilometers must be a valid number greater than the starting KMs.');
                return;
            }
            
            setIsTracking(false); 
            await new Promise(resolve => setTimeout(resolve, 200));

            setIsFetchingLocation(true);
            setLocationError(false);
            
            try {
                const position = await getLocationWithFallback();
                const { latitude, longitude } = position.coords;
                const locationString = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
                const submissionData = { ...formData, dropPoint: locationString };
                onSubmit(submissionData);
            } catch (error) {
                console.error("End-trip geolocation failed:", error);
                alert("Could not get your location automatically. Please enter it manually.");
                setLocationError(true);
            } finally {
                setIsFetchingLocation(false);
            }
        };

        const handleManualSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (!formData.dropPoint) {
                alert('Please enter the drop-off location.');
                return;
            }
            if (!formData.endKms || formData.endKms <= (booking.startKms || 0)) {
                alert('Ending kilometers must be a valid number greater than the starting KMs.');
                return;
            }
            setIsTracking(false);
            onSubmit(formData);
        }

        return (
            <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={locationError ? handleManualSubmit : handleSubmit} className="bg-white rounded-2xl p-6 shadow-md border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center"><CheckCircle className="w-5 h-5 mr-2 text-indigo-500" />Complete Trip</h3>
                <SystemInput label="End Time" type="time" name="endTime" value={formData.endTime} onChange={handleChange} required />
                <SystemInput label={`Ending Kilometers (Started at ${booking.startKms || 'N/A'})`} type="number" name="endKms" value={formData.endKms} onChange={handleChange} required placeholder="Final odometer reading" min={booking.startKms ? booking.startKms + 1 : 1} />
                
                <AnimatePresence>
                    {locationError && (
                         <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            <SystemInput
                                label="Manual Drop-off Location"
                                name="dropPoint"
                                value={formData.dropPoint}
                                type="text"
                                onChange={handleChange}
                                required
                                placeholder="Type drop-off address..."
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                <button type="submit" disabled={isFetchingLocation} className="w-full bg-gradient-to-r from-indigo-500 to-sky-500 text-white py-3 px-6 rounded-lg hover:from-indigo-600 hover:to-sky-600 transition-all duration-200 font-semibold flex items-center justify-center mt-4 shadow-md hover:shadow-lg disabled:opacity-60">
                    {isFetchingLocation ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                    {isFetchingLocation ? 'Getting Location...' : (locationError ? 'Submit Manual Location' : 'Complete Trip')}
                </button>
            </motion.form>
        );
    };


    const CarChangeRequestModal: React.FC<{ onClose: () => void; onSubmit: (data: { reason: string }) => void; }> = ({ onClose, onSubmit }) => {
        const [reason, setReason] = useState('');
        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (!reason.trim()) {
                alert("Please provide a reason for the change request.");
                return;
            }
            onSubmit({ reason });
        };
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-md">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Request Car Change</h2>
                    <p className="text-gray-600 mb-6">Explain why you need a different vehicle. This request will be sent to an administrator for review.</p>
                    <form onSubmit={handleSubmit}>
                        <SystemTextarea label="Reason for Change" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g., A/C not working, unexpected engine noise..." />
                        <div className="flex justify-end gap-4 mt-6">
                            <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors font-semibold">
                                Cancel
                            </button>
                            <button type="submit" className="px-6 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 text-white hover:from-indigo-600 hover:to-sky-600 transition-colors font-semibold">
                                Submit Request
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        );
    };
    
    const ForceEndTripModal: React.FC<{ onClose: () => void; onSubmit: (data: { adminComments: string }) => void; }> = ({ onClose, onSubmit }) => {
        const [adminComments, setAdminComments] = useState('');
        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (!adminComments.trim()) {
                alert("Please provide a reason for force-ending the trip.");
                return;
            }
            onSubmit({ adminComments });
        };
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-md">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Force End Trip</h2>
                    <p className="text-gray-600 mb-6">Provide a reason for manually ending this trip. The assigned car will be marked as available.</p>
                    <form onSubmit={handleSubmit}>
                        <SystemTextarea label="Reason for Ending Trip" name="adminComments" value={adminComments} onChange={(e) => setAdminComments(e.target.value)} required placeholder="e.g., Driver unresponsive, trip completed but not closed." />
                        <div className="flex justify-end gap-4 mt-6">
                            <button type="button" onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors font-semibold">
                                Cancel
                            </button>
                            <button type="submit" className="px-6 py-2 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 transition-colors font-semibold">
                                Confirm & End Trip
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        );
    };

    const RoleSwitcher: React.FC<{ currentUserRole: UserRole; setCurrentUserRole: (role: UserRole) => void; }> = ({ currentUserRole, setCurrentUserRole }) => {
        const roles: UserRole[] = ['employee', 'admin', 'approver', 'driver'];
        return (
            <div className="mb-8 p-4 bg-white rounded-2xl shadow-lg border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center"><Users className="w-5 h-5 mr-2 text-gray-600" />Switch User View</h2>
                <div className="flex flex-wrap gap-3">
                    {roles.map(role => (<button key={role} onClick={() => setCurrentUserRole(role)} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${currentUserRole === role ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{role.charAt(0).toUpperCase() + role.slice(1)}</button>))}
                </div>
            </div>
        );
    };
    
    const SuccessPopup: React.FC<{ message: string; details: any; onClose: () => void; }> = ({ message, details, onClose }) => (
        <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="fixed top-5 right-5 w-96 bg-white p-6 rounded-2xl shadow-2xl border-l-4 border-emerald-500 z-50">
            <div className="flex items-start">
                <CheckCircle className="w-8 h-8 text-emerald-500 mr-4 flex-shrink-0" />
                <div className="flex-grow"><h3 className="font-bold text-gray-800">{message}</h3>{details.booking?.id && <p className="text-sm text-gray-600 mt-1">Booking ID: #{details.booking.id}</p>}</div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XCircle className="w-6 h-6" /></button>
            </div>
        </motion.div>
    );

    return (
        <div className="bg-gray-50 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
            <AnimatePresence>
                {showSuccess && lastSubmission && <SuccessPopup message={lastSubmission.message} details={lastSubmission} onClose={() => setShowSuccess(false)} />}
                {showCarChangeModal && <CarChangeRequestModal onClose={() => setShowCarChangeModal(false)} onSubmit={(data) => handleFormSubmit(data, 'driver_request_change')} />}
                {showForceEndModal && <ForceEndTripModal onClose={() => setShowForceEndModal(false)} onSubmit={(data) => handleFormSubmit(data, 'admin_force_end')} />}
            </AnimatePresence>
            
            <div className="max-w-7xl mx-auto">
                <header className="mb-8 text-center">
                    <h1 className="text-4xl font-bold text-gray-800 tracking-tight flex items-center justify-center"><Car className="inline-block w-10 h-10 mr-3 text-indigo-600" />Corporate Transport Booking System</h1>
                    <p className="text-gray-600 mt-2">A unified portal for managing all your transport needs.</p>
                </header>

                <RoleSwitcher currentUserRole={currentUserRole} setCurrentUserRole={setCurrentUserRole} />

                <div className="mt-6">
                    {['employee', 'guest'].includes(currentUserRole) && renderRequesterPortal()}
                    {currentUserRole === 'admin' && renderAdminPortal()}
                    {currentUserRole === 'approver' && renderApproverPortal()}
                    {currentUserRole === 'driver' && renderDriverPortal()}
                </div>
            </div>
        </div>
    );
};

export default TransportBookingSystem;
