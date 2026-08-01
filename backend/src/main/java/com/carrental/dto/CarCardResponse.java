package com.carrental.dto;

import java.math.BigDecimal;

public class CarCardResponse {
    private Long id;
    private String make;
    private String model;
    private int year;
    private String fuelType;
    private String transmission;
    private int seats;
    private BigDecimal pricePerDay;
    private BigDecimal pricePerHour;
    private String pricingMode;
    private Integer minHours;
    private Integer maxHoursPerDay;
    private Boolean sameDayOnly;
    private Integer cancelPolicyHours;
    private String city;
    private String primaryImage;
    private boolean available;
    private boolean verified;
    private boolean watched;

    public CarCardResponse() {}

    public CarCardResponse(Long id, String make, String model, int year, String fuelType,
                           String transmission, int seats, BigDecimal pricePerDay,
                           String city, String primaryImage, boolean available, boolean verified) {
        this.id = id;
        this.make = make;
        this.model = model;
        this.year = year;
        this.fuelType = fuelType;
        this.transmission = transmission;
        this.seats = seats;
        this.pricePerDay = pricePerDay;
        this.city = city;
        this.primaryImage = primaryImage;
        this.available = available;
        this.verified = verified;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public int getYear() { return year; }
    public void setYear(int year) { this.year = year; }
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
    public Integer getMinHours() { return minHours; }
    public void setMinHours(Integer minHours) { this.minHours = minHours; }
    public Integer getMaxHoursPerDay() { return maxHoursPerDay; }
    public void setMaxHoursPerDay(Integer maxHoursPerDay) { this.maxHoursPerDay = maxHoursPerDay; }
    public Boolean getSameDayOnly() { return sameDayOnly; }
    public void setSameDayOnly(Boolean sameDayOnly) { this.sameDayOnly = sameDayOnly; }
    public Integer getCancelPolicyHours() { return cancelPolicyHours; }
    public void setCancelPolicyHours(Integer cancelPolicyHours) { this.cancelPolicyHours = cancelPolicyHours; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getPrimaryImage() { return primaryImage; }
    public void setPrimaryImage(String primaryImage) { this.primaryImage = primaryImage; }
    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }
    public boolean isVerified() { return verified; }
    public void setVerified(boolean verified) { this.verified = verified; }
    public boolean isWatched() { return watched; }
    public void setWatched(boolean watched) { this.watched = watched; }
}
