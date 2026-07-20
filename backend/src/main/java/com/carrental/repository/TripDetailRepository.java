package com.carrental.repository;

import com.carrental.model.TripDetail;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface TripDetailRepository extends JpaRepository<TripDetail, Long> {
    List<TripDetail> findByCustomerId(Long customerId);
    List<TripDetail> findByOwnerId(Long ownerId);
    List<TripDetail> findByCarId(Long carId);
}
