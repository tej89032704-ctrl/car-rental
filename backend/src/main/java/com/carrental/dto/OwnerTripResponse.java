package com.carrental.dto;

import java.math.BigDecimal;

public class OwnerTripResponse {
    private Long id;
    private Long carId;
    private String carName;
    private String carImage;
    private Long customerId;
    private String customerName;
    private String startDate;
    private String endDate;
    private String startLocation;
    private String endLocation;
    private BigDecimal totalAmount;
    private BigDecimal ownerPayout;
    private String rentalUnit;
    private Integer rentalQty;
    private String status;
    private String createdAt;
    private ReviewResponse myReview;
    private RatingSummaryResponse guestRating;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getCarId() { return carId; }
    public void setCarId(Long carId) { this.carId = carId; }
    public String getCarName() { return carName; }
    public void setCarName(String carName) { this.carName = carName; }
    public String getCarImage() { return carImage; }
    public void setCarImage(String carImage) { this.carImage = carImage; }
    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    public String getEndDate() { return endDate; }
    public void setEndDate(String endDate) { this.endDate = endDate; }
    public String getStartLocation() { return startLocation; }
    public void setStartLocation(String startLocation) { this.startLocation = startLocation; }
    public String getEndLocation() { return endLocation; }
    public void setEndLocation(String endLocation) { this.endLocation = endLocation; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    public BigDecimal getOwnerPayout() { return ownerPayout; }
    public void setOwnerPayout(BigDecimal ownerPayout) { this.ownerPayout = ownerPayout; }
    public String getRentalUnit() { return rentalUnit; }
    public void setRentalUnit(String rentalUnit) { this.rentalUnit = rentalUnit; }
    public Integer getRentalQty() { return rentalQty; }
    public void setRentalQty(Integer rentalQty) { this.rentalQty = rentalQty; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public ReviewResponse getMyReview() { return myReview; }
    public void setMyReview(ReviewResponse myReview) { this.myReview = myReview; }
    public RatingSummaryResponse getGuestRating() { return guestRating; }
    public void setGuestRating(RatingSummaryResponse guestRating) { this.guestRating = guestRating; }
}
