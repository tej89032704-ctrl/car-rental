package com.carrental.repository;

import com.carrental.model.CarMedia;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CarMediaRepository extends JpaRepository<CarMedia, Long> {
    List<CarMedia> findByCarId(Long carId);
}
