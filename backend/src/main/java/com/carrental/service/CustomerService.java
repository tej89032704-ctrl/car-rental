package com.carrental.service;

import com.carrental.dto.*;
import com.carrental.model.*;
import com.carrental.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class CustomerService {

    private static final BigDecimal PLATFORM_FEE_RATE = new BigDecimal("0.10"); // 10%

    private final CustomerRepository customerRepository;
    private final CarRepository carRepository;
    private final CarMediaRepository carMediaRepository;
    private final TripDetailRepository tripDetailRepository;
    private final TransactionRepository transactionRepository;
    private final DocumentRepository documentRepository;
    private final OwnerRepository ownerRepository;

    public CustomerService(CustomerRepository customerRepository, CarRepository carRepository,
                           CarMediaRepository carMediaRepository, TripDetailRepository tripDetailRepository,
                           TransactionRepository transactionRepository, DocumentRepository documentRepository,
                           OwnerRepository ownerRepository) {
        this.customerRepository = customerRepository;
        this.carRepository = carRepository;
        this.carMediaRepository = carMediaRepository;
        this.tripDetailRepository = tripDetailRepository;
        this.transactionRepository = transactionRepository;
        this.documentRepository = documentRepository;
        this.ownerRepository = ownerRepository;
    }

    /* ================= PROFILE ================= */

    public CustomerProfileResponse getProfile(Customer customer) {
        return new CustomerProfileResponse(
                customer.getId(),
                customer.getName(),
                customer.getEmail(),
                customer.getPhone(),
                customer.getCity(),
                customer.isVerified(),
                customer.getCreatedAt() == null ? null : customer.getCreatedAt().toString()
        );
    }

    @Transactional
    public CustomerProfileResponse updateProfile(Customer customer, UpdateProfileRequest req) {
        if (req.getName() != null && !req.getName().isBlank()) customer.setName(req.getName().trim());
        if (req.getPhone() != null) customer.setPhone(req.getPhone().trim());
        if (req.getCity() != null) customer.setCity(req.getCity().trim());
        customer.setUpdatedAt(LocalDateTime.now());
        customerRepository.save(customer);
        return getProfile(customer);
    }

    /* ================= CARS ================= */

    public List<CarCardResponse> listCars(String city, String fuelType, String transmission,
                                          BigDecimal minPrice, BigDecimal maxPrice, String search) {
        List<Car> all = carRepository.findAll();
        return all.stream()
                .filter(Car::isAvailable)
                .filter(Car::isVerified)
                .filter(c -> city == null || city.isBlank() || city.equalsIgnoreCase(c.getCity()))
                .filter(c -> fuelType == null || fuelType.isBlank() || fuelType.equalsIgnoreCase(c.getFuelType()))
                .filter(c -> transmission == null || transmission.isBlank() || transmission.equalsIgnoreCase(c.getTransmission()))
                .filter(c -> minPrice == null || c.getPricePerDay().compareTo(minPrice) >= 0)
                .filter(c -> maxPrice == null || c.getPricePerDay().compareTo(maxPrice) <= 0)
                .filter(c -> search == null || search.isBlank()
                        || (c.getMake() + " " + c.getModel()).toLowerCase().contains(search.toLowerCase()))
                .sorted(Comparator.comparing(Car::getPricePerDay))
                .map(this::toCarCard)
                .collect(Collectors.toList());
    }

    public CarDetailResponse getCarDetail(Long carId) {
        Car car = carRepository.findById(carId)
                .orElseThrow(() -> new RuntimeException("Car not found"));
        List<CarMedia> media = carMediaRepository.findByCarId(carId);
        CarDetailResponse resp = new CarDetailResponse();
        resp.setId(car.getId());
        resp.setMake(car.getMake());
        resp.setModel(car.getModel());
        resp.setYear(car.getYear());
        resp.setRegistrationNumber(car.getRegistrationNumber());
        resp.setColor(car.getColor());
        resp.setFuelType(car.getFuelType());
        resp.setTransmission(car.getTransmission());
        resp.setSeats(car.getSeats());
        resp.setPricePerDay(car.getPricePerDay());
        resp.setPricePerHour(car.getPricePerHour());
        resp.setPricingMode(car.getPricingMode());
        resp.setMinHours(car.getMinHours());
        resp.setMaxHoursPerDay(car.getMaxHoursPerDay());
        resp.setSameDayOnly(car.getSameDayOnly());
        resp.setCancelPolicyHours(car.getCancelPolicyHours());
        resp.setCity(car.getCity());
        resp.setDescription(car.getDescription());
        resp.setAvailable(car.isAvailable());
        resp.setVerified(car.isVerified());
        Owner owner = car.getOwner();
        if (owner != null) {
            resp.setOwnerName(owner.getName());
            resp.setOwnerCity(owner.getCity());
        }
        List<String> urls = media.stream()
                .sorted(Comparator.comparingInt(CarMedia::getDisplayOrder))
                .map(CarMedia::getMediaUrl)
                .collect(Collectors.toList());
        resp.setMediaUrls(urls);
        resp.setPrimaryImage(media.stream()
                .filter(CarMedia::isPrimary)
                .map(CarMedia::getMediaUrl)
                .findFirst()
                .orElse(urls.isEmpty() ? null : urls.get(0)));
        return resp;
    }

    private CarCardResponse toCarCard(Car c) {
        String image = carMediaRepository.findByCarId(c.getId()).stream()
                .sorted(Comparator.comparing(CarMedia::getDisplayOrder))
                .map(CarMedia::getMediaUrl)
                .findFirst()
                .orElse(null);
        CarCardResponse resp = new CarCardResponse(c.getId(), c.getMake(), c.getModel(), c.getYear(), c.getFuelType(),
                c.getTransmission(), c.getSeats(), c.getPricePerDay(), c.getCity(), image,
                c.isAvailable(), c.isVerified());
        resp.setPricePerHour(c.getPricePerHour());
        resp.setPricingMode(c.getPricingMode());
        resp.setMinHours(c.getMinHours());
        resp.setMaxHoursPerDay(c.getMaxHoursPerDay());
        resp.setSameDayOnly(c.getSameDayOnly());
        resp.setCancelPolicyHours(c.getCancelPolicyHours());
        return resp;
    }

    /* ================= TRIPS ================= */

    @Transactional
    public TripResponse createTrip(Customer customer, TripRequest req) {
        if (req.getCarId() == null) throw new RuntimeException("carId is required");
        Car car = carRepository.findById(req.getCarId())
                .orElseThrow(() -> new RuntimeException("Car not found"));
        if (!car.isAvailable()) throw new RuntimeException("This car is not available for booking");
        if (!car.isVerified()) throw new RuntimeException("This car is not verified yet");

        String unit = normalizeUnit(req.getRentalUnit());
        String mode = normalizeMode(car.getPricingMode());

        if ("HOUR".equals(unit)) {
            return createHourlyTrip(customer, req, car, mode);
        }
        return createDailyTrip(customer, req, car, mode);
    }

    private TripResponse createDailyTrip(Customer customer, TripRequest req, Car car, String mode) {
        if (!"DAILY".equals(mode) && !"BOTH".equals(mode)) {
            throw new RuntimeException("This car is only available for hourly rentals");
        }
        LocalDate start = parseDate(req.getStartDate(), "startDate");
        LocalDate end = parseDate(req.getEndDate(), "endDate");
        if (end.isBefore(start)) throw new RuntimeException("End date must be on or after start date");
        if (start.isBefore(LocalDate.now())) throw new RuntimeException("Start date cannot be in the past");
        if (start.isEqual(end)) throw new RuntimeException("Booking must be at least one day");

        // Overlap check: any non-cancelled trip for this car, comparing date/date-time intervals
        checkOverlap(car.getId(), start.atStartOfDay(), end.plusDays(1).atStartOfDay());

        long days = ChronoUnit.DAYS.between(start, end);
        BigDecimal total = car.getPricePerDay().multiply(BigDecimal.valueOf(days));
        BigDecimal platformFee = total.multiply(PLATFORM_FEE_RATE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal ownerPayout = total.subtract(platformFee).setScale(2, RoundingMode.HALF_UP);

        TripDetail trip = new TripDetail();
        trip.setCar(car);
        trip.setCustomer(customer);
        trip.setOwner(car.getOwner());
        trip.setRentalUnit("DAY");
        trip.setRentalQty((int) days);
        trip.setStartDate(start);
        trip.setEndDate(end);
        trip.setStartLocation(req.getStartLocation());
        trip.setEndLocation(req.getEndLocation());
        trip.setTotalAmount(total);
        trip.setStatus("confirmed");
        trip.setCreatedAt(LocalDateTime.now());
        trip = tripDetailRepository.save(trip);

        saveTransaction(trip, customer, car.getOwner(), total, platformFee, ownerPayout, req.getPaymentMethod());

        return toTripResponse(trip, total, platformFee, ownerPayout,
                req.getPaymentMethod() != null && !req.getPaymentMethod().isBlank()
                        ? req.getPaymentMethod() : "card");
    }

    private TripResponse createHourlyTrip(Customer customer, TripRequest req, Car car, String mode) {
        if (!"HOURLY".equals(mode) && !"BOTH".equals(mode)) {
            throw new RuntimeException("This car is only available for daily rentals");
        }
        if (car.getPricePerHour() == null || car.getPricePerHour().signum() <= 0) {
            throw new RuntimeException("This car does not have an hourly price");
        }
        LocalDateTime start = parseDateTime(req.getStartDateTime(), "startDateTime");
        LocalDateTime end = parseDateTime(req.getEndDateTime(), "endDateTime");
        if (!end.isAfter(start)) throw new RuntimeException("End time must be after start time");
        if (start.isBefore(LocalDateTime.now())) throw new RuntimeException("Start time cannot be in the past");

        long minutes = ChronoUnit.MINUTES.between(start, end);
        long hours = minutes / 60 + (minutes % 60 == 0 ? 0 : 1); // round up to the next hour
        if (hours < 1) throw new RuntimeException("Booking must be at least one hour");

        Integer minHours = car.getMinHours();
        if (minHours != null && minHours > 0 && hours < minHours) {
            throw new RuntimeException("This car requires a minimum of " + minHours
                    + " hour" + (minHours > 1 ? "s" : "") + " per booking");
        }
        Integer maxHours = car.getMaxHoursPerDay();
        if (maxHours != null && maxHours > 0 && hours > maxHours) {
            throw new RuntimeException("This car can only be booked for up to " + maxHours
                    + " hour" + (maxHours > 1 ? "s" : "") + " at a time");
        }
        if (Boolean.TRUE.equals(car.getSameDayOnly())
                && !start.toLocalDate().equals(end.toLocalDate())) {
            throw new RuntimeException("This car can only be booked within a single day (no overnight hourly rentals)");
        }

        checkOverlap(car.getId(), start, end);

        BigDecimal total = car.getPricePerHour().multiply(BigDecimal.valueOf(hours)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal platformFee = total.multiply(PLATFORM_FEE_RATE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal ownerPayout = total.subtract(platformFee).setScale(2, RoundingMode.HALF_UP);

        TripDetail trip = new TripDetail();
        trip.setCar(car);
        trip.setCustomer(customer);
        trip.setOwner(car.getOwner());
        trip.setRentalUnit("HOUR");
        trip.setRentalQty((int) hours);
        trip.setStartDateTime(start);
        trip.setEndDateTime(end);
        trip.setStartDate(start.toLocalDate());
        trip.setEndDate(end.toLocalDate());
        trip.setStartLocation(req.getStartLocation());
        trip.setEndLocation(req.getEndLocation());
        trip.setTotalAmount(total);
        trip.setStatus("confirmed");
        trip.setCreatedAt(LocalDateTime.now());
        trip = tripDetailRepository.save(trip);

        saveTransaction(trip, customer, car.getOwner(), total, platformFee, ownerPayout, req.getPaymentMethod());

        return toTripResponse(trip, total, platformFee, ownerPayout,
                req.getPaymentMethod() != null && !req.getPaymentMethod().isBlank()
                        ? req.getPaymentMethod() : "card");
    }

    public List<TripResponse> listTrips(Customer customer, String status) {
        List<TripDetail> trips = tripDetailRepository.findByCustomerId(customer.getId());
        return trips.stream()
                .filter(t -> status == null || status.isBlank() || status.equalsIgnoreCase(t.getStatus()))
                .sorted(Comparator.comparing(TripDetail::getCreatedAt).reversed())
                .map(t -> toTripResponse(t, t.getTotalAmount(), null, null, null))
                .collect(Collectors.toList());
    }

    public TripResponse getTrip(Customer customer, Long tripId) {
        TripDetail t = tripDetailRepository.findById(tripId)
                .orElseThrow(() -> new RuntimeException("Trip not found"));
        if (t.getCustomer() == null || !t.getCustomer().getId().equals(customer.getId())) {
            throw new RuntimeException("Trip not found");
        }
        return toTripResponse(t, t.getTotalAmount(), null, null, null);
    }

    @Transactional
    public TripResponse cancelTrip(Customer customer, Long tripId) {
        TripDetail t = tripDetailRepository.findById(tripId)
                .orElseThrow(() -> new RuntimeException("Trip not found"));
        if (t.getCustomer() == null || !t.getCustomer().getId().equals(customer.getId())) {
            throw new RuntimeException("Trip not found");
        }
        if ("cancelled".equalsIgnoreCase(t.getStatus())) {
            throw new RuntimeException("Trip is already cancelled");
        }
        Integer policyHrs = t.getCar() == null ? null : t.getCar().getCancelPolicyHours();
        if (policyHrs != null) {
            LocalDateTime pickup = pickupStart(t);
            if (pickup == null || !LocalDateTime.now().isBefore(pickup.minusHours(policyHrs))) {
                throw new RuntimeException("Free cancellation window has passed — you must cancel at least "
                        + policyHrs + " hours before pickup");
            }
        }
        t.setStatus("cancelled");
        t.setUpdatedAt(LocalDateTime.now());
        tripDetailRepository.save(t);

        // Refund-style: mark transaction cancelled
        transactionRepository.findByTripId(tripId).forEach(tx -> {
            tx.setStatus("refunded");
            transactionRepository.save(tx);
        });

        return toTripResponse(t, t.getTotalAmount(), null, null, null);
    }

    private TripResponse toTripResponse(TripDetail t, BigDecimal total, BigDecimal platformFee,
                                        BigDecimal ownerPayout, String paymentMethod) {
        TripResponse r = new TripResponse();
        r.setId(t.getId());
        r.setCarId(t.getCar() == null ? null : t.getCar().getId());
        r.setCarName(t.getCar() == null ? null : t.getCar().getMake() + " " + t.getCar().getModel());
        r.setCarImage(primaryImageOf(t.getCar()));
        r.setOwnerId(t.getOwner() == null ? null : t.getOwner().getId());
        r.setOwnerName(t.getOwner() == null ? null : t.getOwner().getName());
        r.setRentalUnit(t.getRentalUnit());
        r.setRentalQty(t.getRentalQty());
        if ("HOUR".equalsIgnoreCase(t.getRentalUnit()) && t.getStartDateTime() != null) {
            r.setStartDate(t.getStartDateTime().toString().replace('T', ' '));
            r.setEndDate(t.getEndDateTime() == null ? null : t.getEndDateTime().toString().replace('T', ' '));
        } else {
            r.setStartDate(t.getStartDate() == null ? null : t.getStartDate().toString());
            r.setEndDate(t.getEndDate() == null ? null : t.getEndDate().toString());
        }
        r.setStartLocation(t.getStartLocation());
        r.setEndLocation(t.getEndLocation());
        r.setTotalAmount(total != null ? total : t.getTotalAmount());
        r.setStatus(t.getStatus());
        r.setCreatedAt(t.getCreatedAt() == null ? null : t.getCreatedAt().toString());
        Integer policyHrs = t.getCar() == null ? null : t.getCar().getCancelPolicyHours();
        if (policyHrs != null) {
            LocalDateTime pickup = pickupStart(t);
            if (pickup != null) {
                r.setCancelDeadline(pickup.minusHours(policyHrs).toString().replace('T', ' '));
            }
        }

        // Fill fee/payout from the matching transaction when not supplied
        if (platformFee == null || ownerPayout == null) {
            transactionRepository.findByTripId(t.getId()).stream()
                    .filter(tx -> !"refunded".equalsIgnoreCase(tx.getStatus()))
                    .findFirst()
                    .ifPresent(tx -> {
                        r.setPlatformFee(tx.getPlatformFee());
                        r.setOwnerPayout(tx.getOwnerPayout());
                        r.setPaymentMethod(tx.getPaymentMethod());
                    });
        } else {
            r.setPlatformFee(platformFee);
            r.setOwnerPayout(ownerPayout);
            r.setPaymentMethod(paymentMethod);
        }
        return r;
    }

    private LocalDateTime pickupStart(TripDetail t) {
        if ("HOUR".equalsIgnoreCase(t.getRentalUnit()) && t.getStartDateTime() != null) {
            return t.getStartDateTime();
        }
        return t.getStartDate() == null ? null : t.getStartDate().atStartOfDay();
    }

    private String primaryImageOf(Car car) {
        if (car == null) return null;
        List<CarMedia> media = carMediaRepository.findByCarId(car.getId());
        return media.stream()
                .filter(CarMedia::isPrimary)
                .map(CarMedia::getMediaUrl)
                .findFirst()
                .orElse(media.isEmpty() ? null : media.get(0).getMediaUrl());
    }

    /* ================= DOCUMENTS ================= */

    public List<DocumentResponse> listDocuments(Customer customer) {
        return documentRepository.findByCustomerId(customer.getId()).stream()
                .sorted(Comparator.comparing(Document::getCreatedAt).reversed())
                .map(this::toDocumentResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public DocumentResponse addDocument(Customer customer, DocumentRequest req) {
        if (req.getDocType() == null || req.getDocType().isBlank()) {
            throw new RuntimeException("docType is required");
        }
        if (req.getDocUrl() == null || req.getDocUrl().isBlank()) {
            throw new RuntimeException("docUrl is required");
        }
        Document doc = new Document();
        doc.setCustomer(customer);
        doc.setDocType(req.getDocType().trim());
        doc.setDocUrl(req.getDocUrl().trim());
        doc.setVerificationStatus("pending");
        doc.setCreatedAt(LocalDateTime.now());
        doc = documentRepository.save(doc);
        return toDocumentResponse(doc);
    }

    @Transactional
    public void deleteDocument(Customer customer, Long docId) {
        Document doc = documentRepository.findById(docId)
                .orElseThrow(() -> new RuntimeException("Document not found"));
        if (doc.getCustomer() == null || !doc.getCustomer().getId().equals(customer.getId())) {
            throw new RuntimeException("Document not found");
        }
        documentRepository.delete(doc);
    }

    private DocumentResponse toDocumentResponse(Document d) {
        return new DocumentResponse(d.getId(), d.getDocType(), d.getDocUrl(),
                d.getVerificationStatus(), d.getRejectionReason(),
                d.getCreatedAt() == null ? null : d.getCreatedAt().toString());
    }

    /* ================= TRANSACTIONS ================= */

    public List<TransactionResponse> listTransactions(Customer customer) {
        return transactionRepository.findByCustomerId(customer.getId()).stream()
                .sorted(Comparator.comparing(Transaction::getCreatedAt).reversed())
                .map(this::toTransactionResponse)
                .collect(Collectors.toList());
    }

    private TransactionResponse toTransactionResponse(Transaction tx) {
        TransactionResponse r = new TransactionResponse();
        r.setId(tx.getId());
        r.setTripId(tx.getTrip() == null ? null : tx.getTrip().getId());
        r.setCarId(tx.getTrip() != null && tx.getTrip().getCar() != null ? tx.getTrip().getCar().getId() : null);
        r.setCarName(tx.getTrip() != null && tx.getTrip().getCar() != null
                ? tx.getTrip().getCar().getMake() + " " + tx.getTrip().getCar().getModel() : null);
        r.setAmount(tx.getAmount());
        r.setPlatformFee(tx.getPlatformFee());
        r.setOwnerPayout(tx.getOwnerPayout());
        r.setPaymentMethod(tx.getPaymentMethod());
        r.setStatus(tx.getStatus());
        r.setRentalUnit(tx.getTrip() == null ? null : tx.getTrip().getRentalUnit());
        r.setRentalQty(tx.getTrip() == null ? null : tx.getTrip().getRentalQty());
        r.setCreatedAt(tx.getCreatedAt() == null ? null : tx.getCreatedAt().toString());
        return r;
    }

    /* ================= HELPERS ================= */

    private LocalDate parseDate(String value, String field) {
        if (value == null || value.isBlank()) throw new RuntimeException(field + " is required");
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new RuntimeException(field + " must be a valid date (YYYY-MM-DD)");
        }
    }

    private String normalizeUnit(String unit) {
        String u = unit == null || unit.isBlank() ? "DAY" : unit.trim().toUpperCase();
        if (!"DAY".equals(u) && !"HOUR".equals(u)) {
            throw new RuntimeException("rentalUnit must be DAY or HOUR");
        }
        return u;
    }

    private String normalizeMode(String mode) {
        String m = mode == null || mode.isBlank() ? "DAILY" : mode.trim().toUpperCase();
        if (!"DAILY".equals(m) && !"HOURLY".equals(m) && !"BOTH".equals(m)) {
            throw new RuntimeException("Invalid pricing mode");
        }
        return m;
    }

    private LocalDateTime parseDateTime(String value, String field) {
        if (value == null || value.isBlank()) throw new RuntimeException(field + " is required");
        try {
            return LocalDateTime.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new RuntimeException(field + " must be a valid date-time (YYYY-MM-DDTHH:mm)");
        }
    }

    private void checkOverlap(Long carId, LocalDateTime reqStart, LocalDateTime reqEnd) {
        List<TripDetail> carTrips = tripDetailRepository.findByCarId(carId);
        boolean overlap = carTrips.stream()
                .filter(t -> !"cancelled".equalsIgnoreCase(t.getStatus()))
                .anyMatch(t -> intervalsOverlap(reqStart, reqEnd, t));
        if (overlap) throw new RuntimeException("This car is already booked for the selected period");
    }

    private boolean intervalsOverlap(LocalDateTime reqStart, LocalDateTime reqEnd, TripDetail t) {
        LocalDateTime tStart;
        LocalDateTime tEnd;
        if ("HOUR".equalsIgnoreCase(t.getRentalUnit())
                && t.getStartDateTime() != null && t.getEndDateTime() != null) {
            tStart = t.getStartDateTime();
            tEnd = t.getEndDateTime();
        } else if (t.getStartDate() != null && t.getEndDate() != null) {
            // day trips occupy [startDate 00:00, endDate+1 00:00)
            tStart = t.getStartDate().atStartOfDay();
            tEnd = t.getEndDate().plusDays(1).atStartOfDay();
        } else {
            return false;
        }
        return reqStart.isBefore(tEnd) && tStart.isBefore(reqEnd);
    }

    private void saveTransaction(TripDetail trip, Customer customer, Owner owner, BigDecimal total,
                                 BigDecimal platformFee, BigDecimal ownerPayout, String paymentMethod) {
        Transaction tx = new Transaction();
        tx.setTrip(trip);
        tx.setCustomer(customer);
        tx.setOwner(owner);
        tx.setAmount(total);
        tx.setPlatformFee(platformFee);
        tx.setOwnerPayout(ownerPayout);
        tx.setPaymentMethod(paymentMethod != null && !paymentMethod.isBlank() ? paymentMethod : "card");
        tx.setStatus("paid");
        tx.setCreatedAt(LocalDateTime.now());
        transactionRepository.save(tx);
    }

    /* Convenience for controller: resolve customer by email */
    public Customer findByEmail(String email) {
        return customerRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Customer not found"));
    }
}
