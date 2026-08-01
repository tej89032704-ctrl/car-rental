package com.carrental.dto;

import java.math.BigDecimal;

public class TripRequest {
    private Long carId;
    private String startDate;
    private String endDate;
    private String startLocation;
    private String endLocation;
    private String paymentMethod;

    public Long getCarId() { return carId; }
    public void setCarId(Long carId) { this.carId = carId; }
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }
    public String getStartLocation() { return startLocation; }
    public void setStartLocation(String startLocation) { this.startLocation = startLocation; }
    public String getEndLocation() { return endLocation; }
    public void setEndLocation(String endLocation) { this.endLocation = endLocation; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
}
