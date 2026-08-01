package com.carrental.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "cars")
public class Car {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private Owner owner;

    @Column(nullable = false)
    private String make;

    @Column(nullable = false)
    private String model;

    @Column(nullable = false)
    private int year;

    @Column(name = "registration_number", unique = true)
    private String registrationNumber;

    private String color;

    @Column(name = "fuel_type")
    private String fuelType;

    private String transmission;

    private int seats;

    @Column(name = "price_per_day", nullable = false)
    private BigDecimal pricePerDay;

    @Column(name = "price_per_hour")
    private BigDecimal pricePerHour;

    @Column(name = "pricing_mode")
    private String pricingMode = "DAILY";

    @Column(name = "min_hours")
    private Integer minHours;

    @Column(name = "max_hours_per_day")
    private Integer maxHoursPerDay;

    @Column(name = "same_day_only")
    private Boolean sameDayOnly;

    @Column(name = "cancel_policy_hours")
    private Integer cancelPolicyHours;

    @Column(nullable = false)
    private String city;

    private String description;

    @Column(name = "is_available")
    private boolean isAvailable = true;

    @Column(name = "is_verified")
    private boolean isVerified = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Owner getOwner() { return owner; }
    public void setOwner(Owner owner) { this.owner = owner; }
    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public int getYear() { return year; }
    public void setYear(int year) { this.year = year; }
    public String getRegistrationNumber() { return registrationNumber; }
    public void setRegistrationNumber(String registrationNumber) { this.registrationNumber = registrationNumber; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
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
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public boolean isAvailable() { return isAvailable; }
    public void setAvailable(boolean available) { isAvailable = available; }
    public boolean isVerified() { return isVerified; }
    public void setVerified(boolean verified) { isVerified = verified; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
