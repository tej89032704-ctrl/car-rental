package com.carrental.dto;

import java.math.BigDecimal;

public class AdminCarResponse {
    private Long id;
    private String make;
    private String model;
    private int year;
    private String registrationNumber;
    private String fuelType;
    private String transmission;
    private int seats;
    private BigDecimal pricePerDay;
    private BigDecimal pricePerHour;
    private String pricingMode;
    private String city;
    private boolean available;
    private boolean verified;
    private String rejectionReason;
    private String primaryImage;
    private String createdAt;
    private String ownerName;
    private String ownerEmail;

    public AdminCarResponse() {}

    public AdminCarResponse(Long id, String make, String model, int year, String registrationNumber,
                            String fuelType, String transmission, int seats, BigDecimal pricePerDay,
                            BigDecimal pricePerHour, String pricingMode, String city,
                            boolean available, boolean verified, String rejectionReason,
                            String primaryImage, String createdAt,
                            String ownerName, String ownerEmail) {
        this.id = id;
        this.make = make;
        this.model = model;
        this.year = year;
        this.registrationNumber = registrationNumber;
        this.fuelType = fuelType;
        this.transmission = transmission;
        this.seats = seats;
        this.pricePerDay = pricePerDay;
        this.pricePerHour = pricePerHour;
        this.pricingMode = pricingMode;
        this.city = city;
        this.available = available;
        this.verified = verified;
        this.rejectionReason = rejectionReason;
        this.primaryImage = primaryImage;
        this.createdAt = createdAt;
        this.ownerName = ownerName;
        this.ownerEmail = ownerEmail;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public int getYear() { return year; }
    public void setYear(int year) { this.year = year; }
    public String getRegistrationNumber() { return registrationNumber; }
    public void setRegistrationNumber(String registrationNumber) { this.registrationNumber = registrationNumber; }
    public String getFuelType() { return fuelType; }
    public void setFuelType(String fuelType) { this.fuelType = fuelType; }
    public String getTransmission() { return transmission; }
    public void setTransmission(String transmission) { this.transmission = transmission; }
    public int getSeats() { return seats; }
    public void setSeats(int seats) { this.seats = seats; }
    public BigDecimal getPricePerDay() { return pricePerDay; }
    public void setPricePerDay(BigDecimal pricePerDay) { this.pricePerDay = pricePerDay; }
    public BigDecimal getPricePerHour() { return pricePerHour; }
    public void setPricePerHour(BigDecimal pricePerHour) { this.pricePerHour = pricePerHour; }
    public String getPricingMode() { return pricingMode; }
    public void setPricingMode(String pricingMode) { this.pricingMode = pricingMode; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }
    public boolean isVerified() { return verified; }
    public void setVerified(boolean verified) { this.verified = verified; }
    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }
    public String getPrimaryImage() { return primaryImage; }
    public void setPrimaryImage(String primaryImage) { this.primaryImage = primaryImage; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String ownerName) { this.ownerName = ownerName; }
    public String getOwnerEmail() { return ownerEmail; }
    public void setOwnerEmail(String ownerEmail) { this.ownerEmail = ownerEmail; }
}
