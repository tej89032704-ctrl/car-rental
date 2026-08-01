package com.carrental.dto;

public class NotificationResponse {
    private Long id;
    private String type;
    private String title;
    private String message;
    private Long carId;
    private Long tripId;
    private boolean read;
    private String createdAt;

    public NotificationResponse() {}

    public NotificationResponse(Long id, String type, String title, String message,
                                Long carId, Long tripId, boolean read, String createdAt) {
        this.id = id;
        this.type = type;
        this.title = title;
        this.message = message;
        this.carId = carId;
        this.tripId = tripId;
        this.read = read;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Long getCarId() { return carId; }
    public void setCarId(Long carId) { this.carId = carId; }
    public Long getTripId() { return tripId; }
    public void setTripId(Long tripId) { this.tripId = tripId; }
    public boolean isRead() { return read; }
    public void setRead(boolean read) { this.read = read; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
