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
        return new CarCardResponse(c.getId(), c.getMake(), c.getModel(), c.getYear(), c.getFuelType(),
                c.getTransmission(), c.getSeats(), c.getPricePerDay(), c.getCity(), image,
                c.isAvailable(), c.isVerified());
    }

    /* ================= TRIPS ================= */

    @Transactional
    public TripResponse createTrip(Customer customer, TripRequest req) {
        if (req.getCarId() == null) throw new RuntimeException("carId is required");
        Car car = carRepository.findById(req.getCarId())
                .orElseThrow(() -> new RuntimeException("Car not found"));
        if (!car.isAvailable()) throw new RuntimeException("This car is not available for booking");
        if (!car.isVerified()) throw new RuntimeException("This car is not verified yet");

        LocalDate start = parseDate(req.getStartDate(), "startDate");
        LocalDate end = parseDate(req.getEndDate(), "endDate");
        if (end.isBefore(start)) throw new RuntimeException("End date must be on or after start date");
        if (start.isBefore(LocalDate.now())) throw new RuntimeException("Start date cannot be in the past");
        if (start.isEqual(end)) throw new RuntimeException("Booking must be at least one day");

        // Overlap check: any non-cancelled trip for this car between [start, end)
        List<TripDetail> carTrips = tripDetailRepository.findByCarId(car.getId());
        boolean overlap = carTrips.stream()
                .filter(t -> !"cancelled".equalsIgnoreCase(t.getStatus()))
                .anyMatch(t -> datesOverlap(start, end, t.getStartDate(), t.getEndDate()));
        if (overlap) throw new RuntimeException("This car is already booked for the selected dates");

        long days = ChronoUnit.DAYS.between(start, end);
        BigDecimal total = car.getPricePerDay().multiply(BigDecimal.valueOf(days));
        BigDecimal platformFee = total.multiply(PLATFORM_FEE_RATE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal ownerPayout = total.subtract(platformFee).setScale(2, RoundingMode.HALF_UP);

        TripDetail trip = new TripDetail();
        trip.setCar(car);
        trip.setCustomer(customer);
        trip.setOwner(car.getOwner());
        trip.setStartDate(start);
        trip.setEndDate(end);
        trip.setStartLocation(req.getStartLocation());
        trip.setEndLocation(req.getEndLocation());
        trip.setTotalAmount(total);
        trip.setStatus("confirmed");
        trip.setCreatedAt(LocalDateTime.now());
        trip = tripDetailRepository.save(trip);

        String paymentMethod = req.getPaymentMethod() != null && !req.getPaymentMethod().isBlank()
                ? req.getPaymentMethod() : "card";

        Transaction tx = new Transaction();
        tx.setTrip(trip);
        tx.setCustomer(customer);
        tx.setOwner(car.getOwner());
        tx.setAmount(total);
        tx.setPlatformFee(platformFee);
        tx.setOwnerPayout(ownerPayout);
        tx.setPaymentMethod(paymentMethod);
        tx.setStatus("paid");
        tx.setCreatedAt(LocalDateTime.now());
        transactionRepository.save(tx);

        return toTripResponse(trip, total, platformFee, ownerPayout, paymentMethod);
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
        r.setStartDate(t.getStartDate() == null ? null : t.getStartDate().toString());
        r.setEndDate(t.getEndDate() == null ? null : t.getEndDate().toString());
        r.setStartLocation(t.getStartLocation());
        r.setEndLocation(t.getEndLocation());
        r.setTotalAmount(total != null ? total : t.getTotalAmount());
        r.setStatus(t.getStatus());
        r.setCreatedAt(t.getCreatedAt() == null ? null : t.getCreatedAt().toString());

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

    private boolean datesOverlap(LocalDate aStart, LocalDate aEnd, LocalDate bStart, LocalDate bEnd) {
        return aStart.isBefore(bEnd) && bStart.isBefore(aEnd);
    }

    /* Convenience for controller: resolve customer by email */
    public Customer findByEmail(String email) {
        return customerRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Customer not found"));
    }
}
