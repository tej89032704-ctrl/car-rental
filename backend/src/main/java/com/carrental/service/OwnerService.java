package com.carrental.service;

import com.carrental.dto.*;
import com.carrental.model.*;
import com.carrental.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class OwnerService {

    private final OwnerRepository ownerRepository;
    private final CarRepository carRepository;
    private final CarMediaRepository carMediaRepository;
    private final TripDetailRepository tripDetailRepository;
    private final TransactionRepository transactionRepository;
    private final DocumentRepository documentRepository;

    public OwnerService(OwnerRepository ownerRepository, CarRepository carRepository,
                        CarMediaRepository carMediaRepository, TripDetailRepository tripDetailRepository,
                        TransactionRepository transactionRepository, DocumentRepository documentRepository) {
        this.ownerRepository = ownerRepository;
        this.carRepository = carRepository;
        this.carMediaRepository = carMediaRepository;
        this.tripDetailRepository = tripDetailRepository;
        this.transactionRepository = transactionRepository;
        this.documentRepository = documentRepository;
    }

    /* ================= PROFILE ================= */

    public OwnerProfileResponse getProfile(Owner owner) {
        return new OwnerProfileResponse(
                owner.getId(),
                owner.getName(),
                owner.getEmail(),
                owner.getPhone(),
                owner.getCity(),
                owner.isVerified(),
                owner.getCreatedAt() == null ? null : owner.getCreatedAt().toString()
        );
    }

    @Transactional
    public OwnerProfileResponse updateProfile(Owner owner, UpdateProfileRequest req) {
        if (req.getName() != null && !req.getName().isBlank()) owner.setName(req.getName().trim());
        if (req.getPhone() != null) owner.setPhone(req.getPhone().trim());
        if (req.getCity() != null) owner.setCity(req.getCity().trim());
        owner.setUpdatedAt(LocalDateTime.now());
        ownerRepository.save(owner);
        return getProfile(owner);
    }

    /* ================= MY CARS ================= */

    public List<OwnerCarResponse> listMyCars(Owner owner) {
        return carRepository.findByOwnerId(owner.getId()).stream()
                .sorted(Comparator.comparing(Car::getCreatedAt).reversed())
                .map(this::toOwnerCarResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public OwnerCarResponse addCar(Owner owner, CarCreateRequest req) {
        Car car = new Car();
        car.setOwner(owner);
        applyCarFields(car, req);
        car.setCreatedAt(LocalDateTime.now());
        car = carRepository.save(car);
        saveMedia(car, req.getMediaUrls());
        return toOwnerCarResponse(car);
    }

    @Transactional
    public OwnerCarResponse updateCar(Owner owner, Long carId, CarCreateRequest req) {
        Car car = carRepository.findById(carId)
                .orElseThrow(() -> new RuntimeException("Car not found"));
        if (car.getOwner() == null || !car.getOwner().getId().equals(owner.getId())) {
            throw new RuntimeException("Car not found");
        }
        applyCarFields(car, req);
        car.setUpdatedAt(LocalDateTime.now());
        car = carRepository.save(car);

        // Replace media if provided
        if (req.getMediaUrls() != null) {
            List<CarMedia> existing = carMediaRepository.findByCarId(carId);
            carMediaRepository.deleteAll(existing);
            saveMedia(car, req.getMediaUrls());
        }
        return toOwnerCarResponse(car);
    }

    @Transactional
    public void deleteCar(Owner owner, Long carId) {
        Car car = carRepository.findById(carId)
                .orElseThrow(() -> new RuntimeException("Car not found"));
        if (car.getOwner() == null || !car.getOwner().getId().equals(owner.getId())) {
            throw new RuntimeException("Car not found");
        }
        carMediaRepository.deleteAll(carMediaRepository.findByCarId(carId));
        carRepository.delete(car);
    }

    private void applyCarFields(Car car, CarCreateRequest req) {
        if (req.getMake() == null || req.getMake().isBlank()) throw new RuntimeException("make is required");
        if (req.getModel() == null || req.getModel().isBlank()) throw new RuntimeException("model is required");
        if (req.getYear() == null) throw new RuntimeException("year is required");
        if (req.getPricePerDay() == null || req.getPricePerDay().signum() <= 0) {
            throw new RuntimeException("pricePerDay must be greater than 0");
        }
        if (req.getCity() == null || req.getCity().isBlank()) throw new RuntimeException("city is required");

        String mode = req.getPricingMode() == null || req.getPricingMode().isBlank()
                ? "DAILY" : req.getPricingMode().trim().toUpperCase();
        if (!List.of("DAILY", "HOURLY", "BOTH").contains(mode)) {
            throw new RuntimeException("pricingMode must be DAILY, HOURLY or BOTH");
        }
        if (!"DAILY".equals(mode)
                && (req.getPricePerHour() == null || req.getPricePerHour().signum() <= 0)) {
            throw new RuntimeException("pricePerHour must be greater than 0");
        }
        Integer minHours = req.getMinHours();
        Integer maxHours = req.getMaxHoursPerDay();
        if (minHours != null && minHours < 1) {
            throw new RuntimeException("minHours must be at least 1");
        }
        if (maxHours != null && maxHours < 1) {
            throw new RuntimeException("maxHoursPerDay must be at least 1");
        }
        if (minHours != null && maxHours != null && maxHours < minHours) {
            throw new RuntimeException("maxHoursPerDay cannot be less than minHours");
        }
        Integer cancelHrs = req.getCancelPolicyHours();
        if (cancelHrs != null && cancelHrs < 0) {
            throw new RuntimeException("cancelPolicyHours cannot be negative");
        }

        car.setMake(req.getMake().trim());
        car.setModel(req.getModel().trim());
        car.setYear(req.getYear());
        car.setRegistrationNumber(req.getRegistrationNumber() != null ? req.getRegistrationNumber().trim() : null);
        car.setColor(req.getColor() != null ? req.getColor().trim() : null);
        car.setFuelType(req.getFuelType() != null ? req.getFuelType().trim() : null);
        car.setTransmission(req.getTransmission() != null ? req.getTransmission().trim() : null);
        car.setSeats(req.getSeats() != null ? req.getSeats() : 4);
        car.setPricePerDay(req.getPricePerDay());
        car.setPricePerHour(req.getPricePerHour());
        car.setPricingMode(mode);
        car.setMinHours(minHours);
        car.setMaxHoursPerDay(maxHours);
        car.setSameDayOnly(req.getSameDayOnly());
        car.setCancelPolicyHours(cancelHrs);
        car.setCity(req.getCity().trim());
        car.setDescription(req.getDescription() != null ? req.getDescription().trim() : null);
        if (req.getAvailable() != null) car.setAvailable(req.getAvailable());
    }

    private void saveMedia(Car car, List<String> mediaUrls) {
        if (mediaUrls == null || mediaUrls.isEmpty()) return;
        int order = 0;
        for (String url : mediaUrls) {
            if (url == null || url.isBlank()) continue;
            CarMedia media = new CarMedia();
            media.setCar(car);
            media.setMediaType("image");
            media.setMediaUrl(url.trim());
            media.setPrimary(order == 0);
            media.setDisplayOrder(order++);
            carMediaRepository.save(media);
        }
    }

    private OwnerCarResponse toOwnerCarResponse(Car c) {
        List<CarMedia> media = carMediaRepository.findByCarId(c.getId());
        List<String> urls = media.stream()
                .sorted(Comparator.comparingInt(CarMedia::getDisplayOrder))
                .map(CarMedia::getMediaUrl)
                .collect(Collectors.toList());
        OwnerCarResponse r = new OwnerCarResponse();
        r.setId(c.getId());
        r.setMake(c.getMake());
        r.setModel(c.getModel());
        r.setYear(c.getYear());
        r.setRegistrationNumber(c.getRegistrationNumber());
        r.setColor(c.getColor());
        r.setFuelType(c.getFuelType());
        r.setTransmission(c.getTransmission());
        r.setSeats(c.getSeats());
        r.setPricePerDay(c.getPricePerDay());
        r.setPricePerHour(c.getPricePerHour());
        r.setPricingMode(c.getPricingMode());
        r.setMinHours(c.getMinHours());
        r.setMaxHoursPerDay(c.getMaxHoursPerDay());
        r.setSameDayOnly(c.getSameDayOnly());
        r.setCancelPolicyHours(c.getCancelPolicyHours());
        r.setCity(c.getCity());
        r.setDescription(c.getDescription());
        r.setAvailable(c.isAvailable());
        r.setVerified(c.isVerified());
        r.setMediaUrls(urls);
        r.setPrimaryImage(media.stream()
                .filter(CarMedia::isPrimary)
                .map(CarMedia::getMediaUrl)
                .findFirst()
                .orElse(urls.isEmpty() ? null : urls.get(0)));
        return r;
    }

    /* ================= TRIPS / BOOKINGS ================= */

    public List<OwnerTripResponse> listTrips(Owner owner, String status) {
        return tripDetailRepository.findByOwnerId(owner.getId()).stream()
                .filter(t -> status == null || status.isBlank() || status.equalsIgnoreCase(t.getStatus()))
                .sorted(Comparator.comparing(TripDetail::getCreatedAt).reversed())
                .map(this::toOwnerTripResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public OwnerTripResponse updateTripStatus(Owner owner, Long tripId, String status) {
        if (status == null || status.isBlank()) throw new RuntimeException("status is required");
        String normalized = status.trim().toLowerCase();
        if (!List.of("pending", "confirmed", "completed", "cancelled").contains(normalized)) {
            throw new RuntimeException("Invalid status. Use pending, confirmed, completed or cancelled");
        }
        TripDetail t = tripDetailRepository.findById(tripId)
                .orElseThrow(() -> new RuntimeException("Trip not found"));
        if (t.getOwner() == null || !t.getOwner().getId().equals(owner.getId())) {
            throw new RuntimeException("Trip not found");
        }
        if ("cancelled".equalsIgnoreCase(t.getStatus())) {
            throw new RuntimeException("Trip is already cancelled");
        }
        if ("completed".equalsIgnoreCase(t.getStatus())) {
            throw new RuntimeException("Trip is already completed");
        }
        t.setStatus(normalized);
        t.setUpdatedAt(LocalDateTime.now());
        tripDetailRepository.save(t);
        return toOwnerTripResponse(t);
    }

    private OwnerTripResponse toOwnerTripResponse(TripDetail t) {
        OwnerTripResponse r = new OwnerTripResponse();
        r.setId(t.getId());
        r.setCarId(t.getCar() == null ? null : t.getCar().getId());
        r.setCarName(t.getCar() == null ? null : t.getCar().getMake() + " " + t.getCar().getModel());
        r.setCarImage(primaryImageOf(t.getCar()));
        r.setCustomerId(t.getCustomer() == null ? null : t.getCustomer().getId());
        r.setCustomerName(t.getCustomer() == null ? null : t.getCustomer().getName());
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
        r.setTotalAmount(t.getTotalAmount());
        r.setStatus(t.getStatus());
        r.setCreatedAt(t.getCreatedAt() == null ? null : t.getCreatedAt().toString());

        transactionRepository.findByTripId(t.getId()).stream()
                .filter(tx -> !"refunded".equalsIgnoreCase(tx.getStatus()))
                .findFirst()
                .ifPresent(tx -> r.setOwnerPayout(tx.getOwnerPayout()));
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

    /* ================= TRANSACTIONS / EARNINGS ================= */

    public List<TransactionResponse> listTransactions(Owner owner) {
        return transactionRepository.findByOwnerId(owner.getId()).stream()
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

    public OwnerEarningsResponse getEarningsSummary(Owner owner) {
        OwnerEarningsResponse r = new OwnerEarningsResponse();
        for (Transaction tx : transactionRepository.findByOwnerId(owner.getId())) {
            // earnings only count successfully paid transactions (refunded/pending excluded)
            if (!"paid".equalsIgnoreCase(tx.getStatus())) continue;
            r.setTotalGross(r.getTotalGross().add(zeroSafe(tx.getAmount())));
            r.setTotalPlatformFee(r.getTotalPlatformFee().add(zeroSafe(tx.getPlatformFee())));
            r.setTotalPayout(r.getTotalPayout().add(zeroSafe(tx.getOwnerPayout())));
            r.setPayouts(r.getPayouts() + 1);

            boolean hourly = tx.getTrip() != null
                    && "HOUR".equalsIgnoreCase(tx.getTrip().getRentalUnit());
            if (hourly) {
                r.setHourlyPayout(r.getHourlyPayout().add(zeroSafe(tx.getOwnerPayout())));
                r.setHourlyTrips(r.getHourlyTrips() + 1);
            } else {
                r.setDailyPayout(r.getDailyPayout().add(zeroSafe(tx.getOwnerPayout())));
                r.setDailyTrips(r.getDailyTrips() + 1);
            }
        }
        return r;
    }

    private BigDecimal zeroSafe(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    /* ================= DOCUMENTS ================= */

    public List<DocumentResponse> listDocuments(Owner owner) {
        return documentRepository.findByOwnerId(owner.getId()).stream()
                .sorted(Comparator.comparing(Document::getCreatedAt).reversed())
                .map(this::toDocumentResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public DocumentResponse addDocument(Owner owner, DocumentRequest req) {
        if (req.getDocType() == null || req.getDocType().isBlank()) {
            throw new RuntimeException("docType is required");
        }
        if (req.getDocUrl() == null || req.getDocUrl().isBlank()) {
            throw new RuntimeException("docUrl is required");
        }
        Document doc = new Document();
        doc.setOwner(owner);
        doc.setDocType(req.getDocType().trim());
        doc.setDocUrl(req.getDocUrl().trim());
        doc.setVerificationStatus("pending");
        doc.setCreatedAt(LocalDateTime.now());
        doc = documentRepository.save(doc);
        return toDocumentResponse(doc);
    }

    @Transactional
    public void deleteDocument(Owner owner, Long docId) {
        Document doc = documentRepository.findById(docId)
                .orElseThrow(() -> new RuntimeException("Document not found"));
        if (doc.getOwner() == null || !doc.getOwner().getId().equals(owner.getId())) {
            throw new RuntimeException("Document not found");
        }
        documentRepository.delete(doc);
    }

    private DocumentResponse toDocumentResponse(Document d) {
        return new DocumentResponse(d.getId(), d.getDocType(), d.getDocUrl(),
                d.getVerificationStatus(), d.getRejectionReason(),
                d.getCreatedAt() == null ? null : d.getCreatedAt().toString());
    }

    /* Convenience for controller: resolve owner by email */
    public Owner findByEmail(String email) {
        return ownerRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Owner not found"));
    }
}
