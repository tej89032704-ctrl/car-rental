package com.carrental.dto;

import java.math.BigDecimal;
import java.util.List;

public class CarCreateRequest {
    private String make;
    private String model;
    private Integer year;
    private String registrationNumber;
    private String color;
    private String fuelType;
    private String transmission;
    private Integer seats;
    private BigDecimal pricePerDay;
    private BigDecimal pricePerHour;
    private String pricingMode;
    private Integer minHours;
    private Integer maxHoursPerDay;
    private Boolean sameDayOnly;
    private Integer cancelPolicyHours;
    private String city;
    private String description;
    private Boolean available;
    private List<String> mediaUrls;

    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public Integer getYear() { return year; }
    public void setYear(Integer year) { this.year = year; }
    public String getRegistrationNumber() { return registrationNumber; }
    public void setRegistrationNumber(String registrationNumber) { this.registrationNumber = registrationNumber; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getFuelType() { return fuelType; }
    public void setFuelType(String fuelType) { this.fuelType = fuelType; }
    public String getTransmission() { return transmission; }
    public void setTransmission(String transmission) { this.transmission = transmission; }
    public Integer getSeats() { return seats; }
    public void setSeats(Integer seats) { this.seats = seats; }
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
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Boolean getAvailable() { return available; }
    public void setAvailable(Boolean available) { this.available = available; }
    public List<String> getMediaUrls() { return mediaUrls; }
    public void setMediaUrls(List<String> mediaUrls) { this.mediaUrls = mediaUrls; }
}
